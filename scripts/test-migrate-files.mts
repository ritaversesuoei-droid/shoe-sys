/**
 * 実ファイル形式（勤怠/運行データ）移行 検証。実行: npm run test:migrate-files
 *   合成UTF-8フィクスチャで importShiftsCsv / importDispatchCsv / recompute を実DB検証（クリーンアップ付）。
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { importShiftsCsv } from "@/lib/migrate/import-shifts";
import { importDispatchCsv } from "@/lib/migrate/import-dispatch";
import { recomputeAllMetrics } from "@/lib/migrate/recompute";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const NAMES = ["移行試験 一郎", "移行試験 二郎", "移行試験 三郎", "移行試験 四郎"];

const SHIFTS_CSV = `開始,2026/05/21,終了,2026/05/25,,,,,,,,
,,,,,,,,,,,
開始日,ドライバー名,実績出庫,実績退勤,修正出庫,補正(出庫),修正退勤,補正(退勤),休憩時間,修正理由・備考,状態,row_id
2026/05/21,移行試験 一郎,08:00,20:30,,,,,1:00,,修正なし,SH-TEST-1
2026/05/21,移行試験 二郎,23:36,14:39,,,,,,,修正なし,SH-TEST-2
2026/05/21,移行試験 三郎,,,,,,,,,データ無し,
`;

const DISPATCH_CSV = `所属,ドライバー名,携帯番号,車両NO,物込日,荷主名,物積（住所）,着荷日,着荷地（会社名）,注意事項,高速指示,表示順
庄栄運輸,移行試験 一郎,090-0000-0001,1001,2026/05/21,テスト荷主,知多市,2026/05/21,名古屋市,13:00,高速可,1
大樹興業 ,移行試験 四郎,090-0000-0002,2001,2026/05/21,テスト荷主2,大阪市,2026/05/22,東京都,,,2
`;

async function driverIdByName(name: string): Promise<string | null> {
  const { data } = await sb.from("drivers").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "shoei-mig-"));
  writeFileSync(join(dir, "shifts.csv"), SHIFTS_CSV, "utf8");
  writeFileSync(join(dir, "dispatch.csv"), DISPATCH_CSV, "utf8");

  console.log("\n[勤怠CSV取込]");
  const sr = await importShiftsCsv(sb, join(dir, "shifts.csv"));
  check("2件投入", sr.inserted === 2, sr);
  check("データ無し1件スキップ", sr.skippedNoData >= 1, sr.skippedNoData);

  const id1 = await driverIdByName("移行試験 一郎");
  const id2 = await driverIdByName("移行試験 二郎");
  const id3 = await driverIdByName("移行試験 三郎");
  check("一郎が作成される", !!id1);
  check("二郎が作成される", !!id2);
  check("三郎(データ無し)は作成されない", !id3);

  console.log("\n[指標 再計算]");
  await recomputeAllMetrics(sb);
  const { data: s2 } = await sb.from("shifts").select("restraint_min, night_min").eq("driver_id", id2!).maybeSingle();
  check("日跨ぎ拘束=903分(15h03m)", s2?.restraint_min === 903, s2?.restraint_min);
  check("深夜=324分", s2?.night_min === 324, s2?.night_min);
  const { data: al2 } = await sb.from("compliance_alerts").select("alert_types").eq("driver_id", id2!).maybeSingle();
  check("二郎に拘束超過の違反", (al2?.alert_types ?? []).includes("restraint"), al2);
  const { count: al1 } = await sb.from("compliance_alerts").select("id", { count: "exact", head: true }).eq("driver_id", id1!);
  check("一郎(12.5h)は違反なし", (al1 ?? 0) === 0, al1);

  console.log("\n[運行データCSV取込]");
  const dr = await importDispatchCsv(sb, join(dir, "dispatch.csv"));
  check("2件投入", dr.inserted === 2, dr);
  const { data: dp1 } = await sb.from("dispatch_plans").select("is_subcontract, driver_id").eq("shipper", "テスト荷主").maybeSingle();
  check("自社(庄栄)はis_subcontract=false", dp1?.is_subcontract === false, dp1);
  check("配車が一郎に紐付く", dp1?.driver_id === id1, dp1?.driver_id);
  const { data: dp2 } = await sb.from("dispatch_plans").select("is_subcontract").eq("shipper", "テスト荷主2").maybeSingle();
  check("子車(大樹興業)はis_subcontract=true", dp2?.is_subcontract === true, dp2);

  rmSync(dir, { recursive: true, force: true });
}

async function cleanup() {
  for (const name of NAMES) {
    const id = await driverIdByName(name);
    if (!id) continue;
    await sb.from("dispatch_plans").delete().eq("driver_id", id);
    await sb.from("compliance_alerts").delete().eq("driver_id", id);
    await sb.from("shifts").delete().eq("driver_id", id);
    await sb.from("drivers").delete().eq("id", id);
  }
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
