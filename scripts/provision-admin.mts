/**
 * 管理者アカウント作成（仕様書 F-01: 管理者=Supabase Auth）。
 * 実行: npm run provision:admin
 *   ADMIN_EMAIL / ADMIN_PASSWORD を環境変数で指定可。未指定なら既定メール+ランダムPW。
 *   既存なら パスワードを再設定して既知の資格情報を返す。profiles に role=admin を付与。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { Database } from "@/types/database";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const email = process.env.ADMIN_EMAIL ?? "admin@shoei.example";
const password = process.env.ADMIN_PASSWORD ?? `Shoei-${randomBytes(4).toString("hex")}!`;

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
  const existing = await findUserByEmail(email);
  let userId: string;
  if (existing) {
    userId = existing.id;
    await sb.auth.admin.updateUserById(userId, { password });
    console.log("既存ユーザーのパスワードを再設定しました");
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("作成失敗");
    userId = data.user.id;
    console.log("新規ユーザーを作成しました");
  }

  const { error: pErr } = await sb
    .from("profiles")
    .upsert({ id: userId, role: "admin", display_name: "管理者" });
  if (pErr) throw pErr;

  console.log("\n===== 管理者ログイン情報 =====");
  console.log("URL     : /admin/login");
  console.log("EMAIL   :", email);
  console.log("PASSWORD:", password);
  console.log("================================");
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
