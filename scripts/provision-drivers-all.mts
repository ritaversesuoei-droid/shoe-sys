/**
 * 全ドライバーのログインアカウントを一括作成し、一覧をExcel(.xlsx)に書き出す。
 *   実行: npm run provision:drivers
 *   各有効ドライバーに Supabase Auth ユーザー（email=driver{code}@drivers.shoei.local）＋
 *   新しいランダムパスワードを付与し、profiles(role=driver, driver_id) を紐付ける。
 *   出力: ./driver-accounts.xlsx（パスワードを含むためGit管理しない）
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import type { Database } from "@/types/database";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DOMAIN = "drivers.shoei.local";
// 紛らわしい文字(0/O/1/l/I)を除いた読みやすい8桁パスワード
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genPassword(len = 8): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i]! % ALPHABET.length];
  return s;
}

async function findUserByEmail(target: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === target);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const { data: drivers, error } = await sb
    .from("drivers")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (error) throw error;

  const out: { name: string; code: string; loginId: string; password: string }[] = [];
  for (const d of drivers ?? []) {
    if (!d.code) continue;
    if ((d.name ?? "").includes("テスト")) continue; // テスト用は除外

    const loginId = `driver${d.code}`;
    const email = `${loginId}@${DOMAIN}`;
    const password = genPassword(8);

    let userId: string;
    const existing = await findUserByEmail(email);
    if (existing) {
      userId = existing.id;
      const { error: uErr } = await sb.auth.admin.updateUserById(userId, { password });
      if (uErr) throw uErr;
    } else {
      const { data, error: cErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !data.user) throw cErr ?? new Error("ユーザー作成失敗");
      userId = data.user.id;
    }
    const { error: pErr } = await sb
      .from("profiles")
      .upsert({ id: userId, role: "driver", driver_id: d.id, display_name: d.name });
    if (pErr) throw pErr;

    out.push({ name: d.name, code: d.code, loginId, password });
    console.log(`  ✓ ${d.name}（${loginId}）`);
  }

  // Excel 出力
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ドライバーアカウント");
  ws.columns = [
    { header: "ドライバー名", key: "name", width: 22 },
    { header: "コード", key: "code", width: 10 },
    { header: "ログインID", key: "loginId", width: 22 },
    { header: "パスワード", key: "password", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  out.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const path = process.env.OUT_XLSX ?? "./driver-accounts.xlsx";
  await wb.xlsx.writeFile(path);
  console.log(`\n✓ ${out.length}名ぶんのアカウントを作成/更新し、${path} に書き出しました。`);
  console.log("  ※ このファイルにはパスワードが含まれます。Git にコミットしないでください。");
}

main().catch((e) => {
  console.error("プロビジョニングエラー:", e);
  process.exit(1);
});
