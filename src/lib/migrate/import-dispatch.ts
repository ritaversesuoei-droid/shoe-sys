import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCsvRows } from "./cleanse";
import { createDriverResolver } from "./roster";
import { buildDispatchPayload } from "./dispatch-map";

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

  const { payload, skipped } = await buildDispatchPayload(dataRows, resolver);

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
