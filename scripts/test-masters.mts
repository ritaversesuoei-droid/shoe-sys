/**
 * マスタ管理 RLS 検証（管理者 CRUD / ドライバーは不可）。実行: npm run test:masters
 *   使い捨ての管理者・ドライバー認証で、admin はマスタCRUD可・driver は他者マスタ作成不可を確認。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const users: string[] = [];
const drivers: string[] = [];
const vehicles: string[] = [];

async function makeUser(role: "admin" | "driver", driverId?: string) {
  const email = `mtest_${role}_${Date.now()}_${Math.floor(performance.now())}@shoei.example`;
  const password = `Mt-${randomUUID().slice(0, 8)}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("user作成失敗");
  users.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, role, driver_id: driverId ?? null });
  const client = createClient<Database>(url, anon);
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return client;
}

async function main() {
  const adminClient = await makeUser("admin");

  // 管理者: ドライバー作成
  const code = `MX${Date.now() % 100000}`;
  const { data: created, error: cErr } = await adminClient.from("drivers").insert({ code, name: "管理作成ドライバー" }).select("id").single();
  check("管理者: ドライバー作成可", !cErr && !!created, cErr?.message);
  if (created) drivers.push(created.id);

  // 管理者: 更新（在籍切替）
  if (created) {
    const { error: uErr } = await adminClient.from("drivers").update({ is_active: false, name: "改名" }).eq("id", created.id);
    check("管理者: ドライバー更新可", !uErr, uErr?.message);
    const { data: after } = await admin.from("drivers").select("name, is_active").eq("id", created.id).maybeSingle();
    check("更新が反映", after?.name === "改名" && after?.is_active === false, after);
  }

  // 管理者: 車両作成
  const { data: veh, error: vErr } = await adminClient.from("vehicles").insert({ vehicle_no: `MV${Date.now() % 100000}`, kind: "大型" }).select("id").single();
  check("管理者: 車両作成可", !vErr && !!veh, vErr?.message);
  if (veh) vehicles.push(veh.id);

  // ドライバー: マスタ作成は不可（RLS）
  const drv = await makeUser("driver", drivers[0]);
  const { error: denyErr } = await drv.from("drivers").insert({ code: `NG${Date.now() % 100000}`, name: "不正作成" }).select("id").single();
  check("ドライバー: ドライバー作成は拒否される(RLS)", !!denyErr, "作成できてしまった");
}

async function cleanup() {
  for (const id of vehicles) await admin.from("vehicles").delete().eq("id", id);
  for (const id of drivers) await admin.from("drivers").delete().eq("id", id);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
