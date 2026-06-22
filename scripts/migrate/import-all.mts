/**
 * 現行スプレッドシート(xlsx)一括移行。実行: npm run migrate:all
 *   MIGRATE_DIR（既定 ./migration/input）の2ブックを自動判別し、
 *   drivers→vehicles→客先→shift_log→運行データ の順で取り込み、指標を再計算する。
 *   MIGRATE_RESET=1 で dispatch_plans を全削除してから投入。
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { workbookSheets, loadSheetObjects } from "@/lib/migrate/xlsx";
import { createDriverResolver } from "@/lib/migrate/roster";
import { importDrivers, importVehicles, importCustomers, importShiftLog, importDispatchSheet } from "@/lib/migrate/import-xlsx";
import { importEventLog } from "@/lib/migrate/import-events";
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
  let unko: string | undefined;
  for (const f of files) {
    const sheets = await workbookSheets(f);
    if (sheets.includes("shift_log")) kintai = f;
    if (sheets.includes("運行データ")) unko = f;
  }
  console.log(`勤怠ブック: ${kintai ?? "(なし)"}`);
  console.log(`運行ブック: ${unko ?? "(なし)"}`);
  if (!kintai) throw new Error("shift_log を含むブックが見つかりません");

  // 1) drivers（正式コード）
  const dN = await importDrivers(sb, await loadSheetObjects(kintai, "drivers", 1));
  console.log(`✓ drivers: ${dN}件 upsert`);

  // 2) vehicles
  const vN = await importVehicles(sb, await loadSheetObjects(kintai, "vehicles", 1));
  console.log(`✓ vehicles: ${vN}件 upsert`);

  // 3) 客先マスタ
  const cN = await importCustomers(sb, await loadSheetObjects(kintai, "客先マスタ", 1));
  console.log(`✓ customers: ${cN}件 新規`);

  // 名寄せリゾルバ（drivers投入後にpreload）
  const resolver = createDriverResolver(sb);
  await resolver.preload();

  // 4) shift_log → shifts
  const sr = await importShiftLog(sb, await loadSheetObjects(kintai, "shift_log", 1), resolver);
  console.log(`✓ shifts: ${sr.inserted}件投入 / スキップ ${sr.skipped} / driver新規 ${resolver.created()}`);

  // 5) event_log → events (+ event_items)
  const ev = await importEventLog(sb, await loadSheetObjects(kintai, "event_log", 1), resolver);
  console.log(`✓ events: ${ev.events}件 / 明細 ${ev.items}件 / スキップ ${ev.skipped}`);

  // 6) 運行データ → dispatch_plans
  if (unko) {
    const disp = await importDispatchSheet(sb, await loadSheetObjects(unko, "運行データ", 1), resolver, { reset: process.env.MIGRATE_RESET === "1" });
    console.log(`✓ dispatch_plans: ${disp}件投入 / driver累計新規 ${resolver.created()}`);
  }

  // 6) 指標・違反 再計算
  console.log("指標・違反を再計算中...（時間がかかります）");
  const m = await recomputeAllMetrics(sb);
  console.log(`✓ 再計算: ${m.shifts}勤務 / 違反台帳 ${m.alerts}件`);
  console.log("\n完了。/admin/monthly・/admin/warnings で突合してください。");
}

main().catch((e) => { console.error("移行エラー:", e); process.exit(1); });
