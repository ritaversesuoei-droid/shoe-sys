/**
 * 運行データCSV移行（配車）。実行: npm run migrate:dispatch
 *   MIGRATE_DIR（既定 ./migration/input）の dispatch.csv を取り込む。
 *   MIGRATE_RESET=1 で既存 dispatch_plans を全削除してから投入。
 *   ※ Google スプレッドシートの運行データを UTF-8 CSV で書き出し dispatch.csv として配置すること。
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { importDispatchCsv } from "@/lib/migrate/import-dispatch";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const file = join(process.env.MIGRATE_DIR ?? "./migration/input", "dispatch.csv");

async function main() {
  if (!existsSync(file)) {
    console.error(`ファイルがありません: ${file}`);
    process.exit(1);
  }
  console.log(`運行データCSV取込: ${file}`);
  const r = await importDispatchCsv(sb, file, { reset: process.env.MIGRATE_RESET === "1" });
  console.log(`✓ dispatch_plans: ${r.inserted}件投入 / driver新規 ${r.driversCreated} / スキップ ${r.skipped}`);
}

main().catch((e) => { console.error("移行エラー:", e); process.exit(1); });
