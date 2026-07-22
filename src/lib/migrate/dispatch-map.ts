import type { TablesInsert } from "@/types/database";
import { cleanText, cleanCode, parseDateLoose } from "./cleanse";
import type { createDriverResolver } from "./roster";

type Resolver = ReturnType<typeof createDriverResolver>;

/**
 * 運行データ（配車）の行 → dispatch_plans 挿入ペイロード（純ロジック）。
 * 列順: 0所属 1ドライバー名 2携帯 3車両NO 4積込日 5荷主名 6積地(住所) 7着荷日 8着荷地(会社名) 9注意事項 10高速指示 11表示順
 * 所属に「昭栄」を含まなければ子車(is_subcontract)。子車は driver_id を結ばず driver_name_raw のみ保持。
 * CSV移行(import-dispatch)とシート同期(operations/dispatch-sync)で共有する。
 */
export async function buildDispatchPayload(
  dataRows: string[][],
  resolver: Resolver,
): Promise<{ payload: TablesInsert<"dispatch_plans">[]; skipped: number; dates: string[] }> {
  const payload: TablesInsert<"dispatch_plans">[] = [];
  const dates = new Set<string>();
  let skipped = 0;

  for (const r of dataRows) {
    const planDate = parseDateLoose(r[4]);
    if (!planDate) {
      skipped += 1;
      continue;
    }
    dates.add(planDate);

    const affiliation = cleanText(r[0]);
    const name = cleanText(r[1]);
    const isSub = !!affiliation && !affiliation.includes("昭栄");
    const driverId = !isSub && name
      ? await resolver.resolve(name, { affiliation, create: true })
      : null;

    const note = [
      cleanText(r[9]),
      r[6] ? `発:${cleanText(r[6])}` : "",
      r[7] ? `着日:${parseDateLoose(r[7]) ?? cleanText(r[7])}` : "",
      r[11] ? `順:${cleanText(r[11])}` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    payload.push({
      plan_date: planDate,
      driver_id: driverId,
      driver_name_raw: name || null,
      vehicle_no: cleanCode(r[3]) || null,
      shipper: cleanText(r[5]) || null,
      delivery_spot: cleanText(r[8]) || null,
      highway_instruction: cleanText(r[10]) || null,
      is_subcontract: isSub,
      note: note || null,
    });
  }

  return { payload, skipped, dates: [...dates] };
}
