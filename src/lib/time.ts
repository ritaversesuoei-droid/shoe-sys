/**
 * 時刻・期間ユーティリティ（JST固定運用）。
 * 仕様書 12.3: parseTimeToMinutes / formatMinutesToHHMM の二重定義・"0:00"/"00:00" ゆれを
 *              本ファイルの単一・正規実装に統一する。
 *
 * JST は UTC+9 で DST なし。エポックミリ秒に +9h して「日本ローカルの分」を厳密計算できる。
 */

export const JST_OFFSET_MIN = 9 * 60;
const MS_PER_MIN = 60_000;
const MIN_PER_DAY = 24 * 60;

/** UNIXエポックms → JSTローカルの「0時からの経過分」(0..1439) */
export function jstMinuteOfDay(epochMs: number): number {
  const totalMin = Math.floor(epochMs / MS_PER_MIN) + JST_OFFSET_MIN;
  return ((totalMin % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/** "HH:MM" → 0時からの分。null/空は null。"0:00" も "00:00" も同値で受理。 */
export function parseTimeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) return null; // 日跨ぎ表記(24:xx〜)も許容
  return h * 60 + min;
}

/** 分 → "HH:MM"（常にゼロ埋め2桁。負値・24h超も連続表記） */
export function formatMinutesToHHMM(totalMin: number | null | undefined): string {
  if (totalMin == null || Number.isNaN(totalMin)) return "00:00";
  const sign = totalMin < 0 ? "-" : "";
  const abs = Math.abs(Math.round(totalMin));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 2つの ISO 時刻間の分差（end - start）。不正値は null。 */
export function diffMinutes(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (!startIso || !endIso) return null;
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / MS_PER_MIN);
}
