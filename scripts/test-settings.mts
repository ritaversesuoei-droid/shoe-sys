/**
 * 設定（app_settings）RLS・正規化 検証。実行: npm run test:settings
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { mergeComplianceConfig, DEFAULT_COMPLIANCE_CONFIG } from "@/lib/compliance";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const users: string[] = [];
const keys: string[] = [];

async function makeUser(role: "admin" | "driver") {
  const email = `settest_${role}_${Date.now()}_${Math.floor(performance.now())}@shoei.example`;
  const password = `St-${randomUUID().slice(0, 8)}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("user作成失敗");
  users.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, role });
  const c = createClient<Database>(url, anon);
  const { error: sErr } = await c.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return c;
}

async function main() {
  // 正規化（欠損を既定値で補完）
  const merged = mergeComplianceConfig({ daily_restraint: { max_min: 999 } });
  check("compliance 正規化: 指定値が反映", merged.daily_restraint.max_min === 999, merged.daily_restraint);
  check("compliance 正規化: 欠損は既定値", merged.rest_period.principle_min === DEFAULT_COMPLIANCE_CONFIG.rest_period.principle_min);

  const adminClient = await makeUser("admin");
  const driverClient = await makeUser("driver");
  const key = `test_setting_${Date.now()}`;
  keys.push(key);

  // 管理者: 設定 upsert 可
  const { error: aErr } = await adminClient.from("app_settings").upsert({ key, value: { a: 1 } as never });
  check("管理者: 設定 upsert 可", !aErr, aErr?.message);

  // 認証済みは select 可
  const { data: read } = await driverClient.from("app_settings").select("value").eq("key", key).maybeSingle();
  check("認証済み(driver): 設定 select 可", !!read, read);

  // ドライバー: 書込みは拒否
  const { error: dErr } = await driverClient.from("app_settings").upsert({ key, value: { a: 2 } as never });
  check("ドライバー: 設定 書込みは拒否(RLS)", !!dErr, "書き込めてしまった");
}

async function cleanup() {
  for (const k of keys) await admin.from("app_settings").delete().eq("key", k);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
