/**
 * 修正入力シート移行（shift_log に無い期間の勤怠補完）。実行: npm run migrate:editinput
 *   勤怠ブックの「修正入力」(headerRow=3) → shifts。投入後に指標を再計算。
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { workbookSheets, loadSheetObjects } from "@/lib/migrate/xlsx";
import { createDriverResolver } from "@/lib/migrate/roster";
import { importEditInput } from "@/lib/migrate/import-xlsx";
import { recomputeAllMetrics } from "@/lib/migrate/recompute";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const DIR = process.env.MIGRATE_DIR ?? "./migration/input";

async function main() {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".xlsx")).map((f) => join(DIR, f));
  let kintai: string | undefined;
  for (const f of files) if ((await workbookSheets(f)).includes("修正入力")) kintai = f;
  if (!kintai) throw new Error("修正入力 を含むブックが見つかりません");

  const resolver = createDriverResolver(sb);
  await resolver.preload();
  const r = await importEditInput(sb, await loadSheetObjects(kintai, "修正入力", 3), resolver);
  console.log(`✓ shifts(修正入力): ${r.inserted}件投入 / スキップ ${r.skipped} / driver新規 ${resolver.created()}`);
  console.log("指標・違反を再計算中...");
  const m = await recomputeAllMetrics(sb);
  console.log(`✓ 再計算: ${m.shifts}勤務 / 違反台帳 ${m.alerts}件`);
}

main().catch((e) => { console.error("移行エラー:", e); process.exit(1); });
