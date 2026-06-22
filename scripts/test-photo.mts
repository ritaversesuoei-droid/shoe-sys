/**
 * 打刻写真 Storage RLS 検証（仕様書 4.3.5 / 0008 storage policy）。実行: npm run test:photo
 *   使い捨てのドライバー＋認証ユーザーを作り、「自分の driver_id 配下のみ」アップロード可・
 *   他者配下は拒否、を検証。実データ/既存アカウントには触れない。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { to_month_key } from "@/lib/datekey";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const drivers: string[] = [];
const users: string[] = [];
const uploaded: string[] = [];

async function mkDriver(code: string, name: string) {
  const { data, error } = await admin.from("drivers").insert({ code, name }).select("id").single();
  if (error || !data) throw error ?? new Error("driver作成失敗");
  drivers.push(data.id);
  return data.id;
}

async function main() {
  const { data: bucket } = await admin.storage.getBucket("event-photos");
  check("event-photos バケットが非公開で存在", !!bucket && bucket.public === false, bucket);

  const s = Date.now();
  const meId = await mkDriver(`PA${s % 100000}`, `TEST_PHOTO_ME_${s}`);
  const otherId = await mkDriver(`PB${s % 100000}`, `TEST_PHOTO_OTHER_${s}`);

  const email = `phototest_${s}@shoei.example`;
  const password = `Ph-${randomUUID().slice(0, 8)}!`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr || !created.user) throw cErr ?? new Error("user作成失敗");
  users.push(created.user.id);
  await admin.from("profiles").upsert({ id: created.user.id, role: "driver", driver_id: meId, display_name: "写真テスト" });

  const driverClient = createClient<Database>(url, anon);
  const { error: signErr } = await driverClient.auth.signInWithPassword({ email, password });
  check("使い捨てドライバーでサインイン", !signErr, signErr?.message);
  if (signErr) return;

  const ym = to_month_key(new Date());
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

  const ownPath = `${ym}/${meId}/test_${s}.jpg`;
  const { error: ownErr } = await driverClient.storage.from("event-photos").upload(ownPath, blob, { contentType: "image/jpeg", upsert: true });
  check("自分の driver_id 配下へアップロード可", !ownErr, ownErr?.message);
  if (!ownErr) uploaded.push(ownPath);

  const foreignPath = `${ym}/${otherId}/test_${s}.jpg`;
  const { error: forErr } = await driverClient.storage.from("event-photos").upload(foreignPath, blob, { contentType: "image/jpeg", upsert: true });
  check("他者の driver_id 配下は拒否される", !!forErr, "アップロードできてしまった");
}

async function cleanup() {
  if (uploaded.length) await admin.storage.from("event-photos").remove(uploaded);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  for (const id of drivers) await admin.from("drivers").delete().eq("id", id);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
