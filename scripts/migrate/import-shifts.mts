/**
 * 勤怠CSV移行（shift_log）。実行: npm run migrate:shifts
 *   MIGRATE_DIR（既定 ./migration/input）の shifts.csv を取り込み、指標を再計算する。
 *   ※ Google スプレッドシートの勤怠シートを UTF-8 CSV で書き出し shifts.csv として配置すること。
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { importShiftsCsv } from "@/lib/migrate/import-shifts";
import { recomputeAllMetrics } from "@/lib/migrate/recompute";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const file = join(process.env.MIGRATE_DIR ?? "./migration/input", "shifts.csv");

async function main() {
  if (!existsSync(file)) {
    console.error(`ファイルがありません: ${file}`);
    process.exit(1);
  }
  console.log(`勤怠CSV取込: ${file}`);
  const r = await importShiftsCsv(sb, file);
  console.log(`✓ shifts: ${r.inserted}件投入 / driver新規 ${r.driversCreated} / データ無しスキップ ${r.skippedNoData} / 重複スキップ ${r.skippedDup}`);
  console.log("指標・違反を再計算中...");
  const m = await recomputeAllMetrics(sb);
  console.log(`✓ 再計算: ${m.shifts}勤務 / 違反台帳 ${m.alerts}件`);
}

main().catch((e) => { console.error("移行エラー:", e); process.exit(1); });
