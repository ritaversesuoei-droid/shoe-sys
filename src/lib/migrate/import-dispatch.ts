import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import { parseCsvRows, cleanText, cleanCode, parseDateLoose } from "./cleanse";
import { createDriverResolver } from "./roster";

type SB = SupabaseClient<Database>;

/**
 * 運行データCSV（配車）→ drivers + dispatch_plans。
 * 列順: 0 所属 / 1 ドライバー名 / 2 携帯番号 / 3 車両NO / 4 物込日 / 5 荷主名 /
 *   6 物積(住所) / 7 着荷日 / 8 着荷地(会社名) / 9 注意事項 / 10 高速指示 / 11 表示順
 * 所属に「昭栄」を含まなければ子車(is_subcontract)。子車は drivers に作らず
 * driver_name_raw のみ保持（自社のみ driver_id 連結）。発地/着日/注意は note へ集約。
 */
export interface DispatchImportResult {
  driversCreated: number;
  inserted: number;
  skipped: number;
}

export async function importDispatchCsv(
  sb: SB,
  filePath: string,
  opts: { reset?: boolean } = {},
): Promise<DispatchImportResult> {
  const rows = parseCsvRows(readFileSync(filePath, "utf8"));
  if (rows.length < 2) return { driversCreated: 0, inserted: 0, skipped: 0 };
  const dataRows = rows.slice(1); // 1行目はヘッダ

  if (opts.reset) {
    await sb.from("dispatch_plans").delete().not("id", "is", null);
  }

  const resolver = createDriverResolver(sb);
  await resolver.preload();

  const payload: TablesInsert<"dispatch_plans">[] = [];
  let skipped = 0;

  for (const r of dataRows) {
    const planDate = parseDateLoose(r[4]);
    if (!planDate) {
      skipped += 1;
      continue;
    }
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

  // バッチ投入（500件単位）
  let inserted = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await sb.from("dispatch_plans").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  return { driversCreated: resolver.created(), inserted, skipped };
}
