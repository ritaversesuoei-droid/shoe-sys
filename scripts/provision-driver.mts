/**
 * ドライバー（テスト用）アカウント作成。実行: npm run provision:driver
 *   ドライバーマスタ + Supabase Auth ユーザー + profiles(role=driver, driver_id) を用意。
 *   本番はLIFFログインで自動プロビジョニングされる（/api/auth/line）。これは開発検証用。
 *   DRIVER_EMAIL / DRIVER_PASSWORD / DRIVER_CODE / DRIVER_NAME を環境変数で指定可。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { Database } from "@/types/database";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const email = process.env.DRIVER_EMAIL ?? "driver@shoei.example";
const password = process.env.DRIVER_PASSWORD ?? `Drv-${randomBytes(4).toString("hex")}!`;
const code = process.env.DRIVER_CODE ?? "01";
const name = process.env.DRIVER_NAME ?? "テスト ドライバー";

async function findUserByEmail(target: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === target);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  // ドライバーマスタ（code で upsert 相当）
  let driverId: string;
  const { data: existDriver } = await sb.from("drivers").select("id").eq("code", code).maybeSingle();
  if (existDriver) {
    driverId = existDriver.id;
  } else {
    const { data, error } = await sb
      .from("drivers")
      .insert({ code, name, default_vehicle_no: "1001", affiliation: "自社" })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("driver作成失敗");
    driverId = data.id;
  }

  // Auth ユーザー
  let userId: string;
  const existing = await findUserByEmail(email);
  if (existing) {
    userId = existing.id;
    await sb.auth.admin.updateUserById(userId, { password });
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("ユーザー作成失敗");
    userId = data.user.id;
  }

  // profiles 紐付け
  const { error: pErr } = await sb
    .from("profiles")
    .upsert({ id: userId, role: "driver", driver_id: driverId, display_name: name });
  if (pErr) throw pErr;

  console.log("\n===== ドライバーログイン情報（開発用）=====");
  console.log("URL     : /driver");
  console.log("EMAIL   :", email);
  console.log("PASSWORD:", password);
  console.log("DRIVER  :", `${code} / ${name}`);
  console.log("==========================================");
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
