import { JST_OFFSET_MIN } from "@/lib/time";

/**
 * JST 基準の日付キー生成（仕様書 11.2 タイムゾーン統一）。
 * SQL 側 public.to_month_key と整合させる。
 */

function toJstParts(input: Date | string): { y: number; m: number; d: number } {
  const ms = typeof input === "string" ? Date.parse(input) : input.getTime();
  const jst = new Date(ms + JST_OFFSET_MIN * 60_000);
  // getUTC* で「JSTローカル」値を読む（+9hシフト済みのため）
  return { y: jst.getUTCFullYear(), m: jst.getUTCMonth() + 1, d: jst.getUTCDate() };
}

/** yyyyMM（集計・カウンタ用 月キー） */
export function to_month_key(input: Date | string): string {
  const { y, m } = toJstParts(input);
  return `${y}${String(m).padStart(2, "0")}`;
}

/** yyyy-MM-dd（DB date 型 / work_date 用、JST日付） */
export function toWorkDate(input: Date | string): string {
  const { y, m, d } = toJstParts(input);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
