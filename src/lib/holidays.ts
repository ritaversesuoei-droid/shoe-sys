/**
 * 日本の国民の祝日・振替休日・国民の休日の算出（祝日法準拠・1980〜2099）。
 * 月次の休日労働判定（F-14）で使用。外部データソース不要の決定的アルゴリズム。
 * - 固定日 / ハッピーマンデー / 春分・秋分（近似式）/ 振替休日（日曜と重なれば後ろ倒し）/ 国民の休日（祝日に挟まれた平日）
 * 注: 2020〜2021 の五輪特例移動は対象外（実運用年 2024〜 を想定）。
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay(); // 0=日
function addDaysStr(s: string, days: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** その年・月の第 nth 月曜日（ハッピーマンデー）の「日」。 */
function nthMonday(year: number, month: number, nth: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstMon = 1 + ((1 - first + 7) % 7);
  return firstMon + (nth - 1) * 7;
}
const vernalEquinox = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnalEquinox = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const cache = new Map<number, Map<string, string>>();

/** 指定年の祝日 Map（日付文字列 → 名称）。振替・国民の休日を含む。 */
export function holidaysOfYear(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const base = new Map<string, string>();
  const add = (m: number, d: number, name: string) => base.set(ymd(year, m, d), name);

  add(1, 1, "元日");
  base.set(ymd(year, 1, nthMonday(year, 1, 2)), "成人の日");
  add(2, 11, "建国記念の日");
  if (year >= 2020) add(2, 23, "天皇誕生日");
  else add(12, 23, "天皇誕生日");
  add(3, vernalEquinox(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  base.set(ymd(year, 7, nthMonday(year, 7, 3)), "海の日");
  add(8, 11, "山の日");
  base.set(ymd(year, 9, nthMonday(year, 9, 3)), "敬老の日");
  add(9, autumnalEquinox(year), "秋分の日");
  base.set(ymd(year, 10, nthMonday(year, 10, 2)), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  const result = new Map(base);

  // 国民の休日: 前後がともに祝日で、日曜でない平日（base 基準）
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const s = ymd(year, m, d);
      if (new Date(`${s}T00:00:00Z`).getUTCMonth() + 1 !== m) continue; // 月末超え除外
      if (base.has(s) || dow(s) === 0) continue;
      if (base.has(addDaysStr(s, -1)) && base.has(addDaysStr(s, 1))) result.set(s, "国民の休日");
    }
  }

  // 振替休日: 日曜と重なる祝日の「後で最も近い祝日でない日」
  for (const [s, name] of base) {
    if (dow(s) !== 0 || name === "振替休日") continue;
    let n = addDaysStr(s, 1);
    while (result.has(n)) n = addDaysStr(n, 1);
    result.set(n, "振替休日");
  }

  cache.set(year, result);
  return result;
}

/** その日が国民の祝日・振替・国民の休日か。 */
export function isNationalHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return holidaysOfYear(year).has(dateStr);
}

/** 祝日名（無ければ null）。 */
export function holidayName(dateStr: string): string | null {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return holidaysOfYear(year).get(dateStr) ?? null;
}

export type DayClass = "holiday" | "workday";

/**
 * 休日区分の判定。手修正(overrides)を最優先し、無ければ 土日 or 祝日 を休日とする。
 * overrides: { 'yyyy-MM-dd': 'holiday' | 'workday' }（app_settings('holiday_overrides')）。
 */
export function classifyDay(dateStr: string, overrides?: Record<string, DayClass>): DayClass {
  const ov = overrides?.[dateStr];
  if (ov === "holiday" || ov === "workday") return ov;
  const wd = dow(dateStr);
  return wd === 0 || wd === 6 || isNationalHoliday(dateStr) ? "holiday" : "workday";
}
