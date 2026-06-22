import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCsvRows, cleanText, parseDateLoose, parseNumberLoose, normTime, addDays } from "./cleanse";
import { to_month_key } from "@/lib/datekey";
import { parseTimeToMinutes } from "@/lib/time";
import { createDriverResolver } from "./roster";

type SB = SupabaseClient<Database>;

/**
 * 勤怠CSV（shift_log / 修正入力）→ drivers + shifts。
 * 列順(固定): 0 開始日 / 1 ドライバー名 / 2 実績出庫 / 3 実績退勤 / 4 修正出庫 /
 *   5 補正(出庫) / 6 修正退勤 / 7 補正(退勤) / 8 休憩時間 / 9 修正理由・備考 / 10 状態 / 11 row_id
 * 先頭に「開始,日付,終了,日付」等のメタ行があるため、row_id を含むヘッダ行を検出して以降を処理する。
 * 時刻ベースで確定 clock_in/out を構築（退勤<出勤 かつ 補正0 なら翌日跨ぎ）。指標は別途 recompute。
 */
export interface ShiftImportResult {
  driversCreated: number;
  inserted: number;
  skippedNoData: number;
  skippedDup: number;
}

function intToInterval(rest: string | null | undefined): string {
  const t = normTime(rest);
  return t ? `${t}:00` : "0";
}

export async function importShiftsCsv(sb: SB, filePath: string): Promise<ShiftImportResult> {
  const rows = parseCsvRows(readFileSync(filePath, "utf8"));
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "row_id"));
  const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;

  const resolver = createDriverResolver(sb);
  await resolver.preload();

  let inserted = 0;
  let skippedNoData = 0;
  let skippedDup = 0;

  for (const r of dataRows) {
    const workDate = parseDateLoose(r[0]);
    const name = cleanText(r[1]);
    const actualIn = normTime(r[2]);
    const actualOut = normTime(r[3]);
    if (!workDate || !name || !actualIn || !actualOut) {
      skippedNoData += 1;
      continue;
    }
    const editedIn = normTime(r[4]);
    const inAdj = parseNumberLoose(r[5]) ?? 0;
    const editedOut = normTime(r[6]);
    const outAdj = parseNumberLoose(r[7]) ?? 0;
    const restRaw = r[8];

    const driverId = (await resolver.resolve(name, { affiliation: "自社", create: true }))!;

    // 重複チェック（driver_id + work_date + actual_in）
    const { data: dup } = await sb
      .from("shifts")
      .select("id")
      .eq("driver_id", driverId)
      .eq("work_date", workDate)
      .eq("actual_in", `${actualIn}:00`)
      .limit(1)
      .maybeSingle();
    if (dup) {
      skippedDup += 1;
      continue;
    }

    const inTime = editedIn ?? actualIn;
    const outTime = editedOut ?? actualOut;
    const inMin = parseTimeToMinutes(inTime) ?? 0;
    const outMin = parseTimeToMinutes(outTime) ?? 0;
    const crossNext = outMin < inMin && outAdj === 0;

    const clockInAt = `${addDays(workDate, inAdj)}T${inTime}:00+09:00`;
    const clockOutAt = `${addDays(workDate, outAdj + (crossNext ? 1 : 0))}T${outTime}:00+09:00`;

    const { error } = await sb.from("shifts").insert({
      driver_id: driverId,
      work_date: workDate,
      month_key: to_month_key(`${workDate}T00:00:00+09:00`),
      clock_in_at: clockInAt,
      clock_out_at: clockOutAt,
      actual_in: `${actualIn}:00`,
      actual_out: `${actualOut}:00`,
      edited_in: editedIn ? `${editedIn}:00` : null,
      edited_out: editedOut ? `${editedOut}:00` : null,
      edited_in_adj_days: inAdj,
      edited_out_adj_days: outAdj,
      rest_time: intToInterval(restRaw),
      revision_status: editedIn || editedOut ? "edited" : "none",
    });
    if (error) throw error;
    inserted += 1;
  }

  return { driversCreated: resolver.created(), inserted, skippedNoData, skippedDup };
}
