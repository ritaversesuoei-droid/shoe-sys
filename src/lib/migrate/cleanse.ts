/**
 * 移行クレンジング規約（仕様書 11.2: 表記ゆれ吸収を移行スクリプトに集約）。
 * 全半角・GMT文字列混在・スペース/カンマ等を正規化する純関数群。アプリ/スクリプト双方から再利用。
 */

const pad = (v: string | number) => String(v).padStart(2, "0");

/** 全角英数記号→半角、全角スペース→半角スペース */
export function toHankaku(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/** 表示用テキスト整形（半角化・trim・連続空白圧縮） */
export function cleanText(s: string | null | undefined): string {
  if (s == null) return "";
  return toHankaku(String(s)).trim().replace(/\s+/g, " ");
}

/** コード整形（半角化・空白除去）。例: 2桁業務ID・車番 */
export function cleanCode(s: string | null | undefined): string {
  if (s == null) return "";
  return toHankaku(String(s)).replace(/\s/g, "").trim();
}

/** 数値の緩いパース（全角・カンマ・空白を除去）。非数値は null */
export function parseNumberLoose(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = toHankaku(String(s)).replace(/[,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 日付の緩いパース → "yyyy-MM-dd"（JST基準）。失敗は null */
export function parseDateLoose(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = toHankaku(String(s)).trim();
  if (!t) return null;
  const m = /^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad(m[2]!)}-${pad(m[3]!)}`;
  const ms = Date.parse(t); // GMT文字列・ISO等
  if (!Number.isNaN(ms)) {
    const j = new Date(ms + 9 * 3600 * 1000);
    return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
  }
  return null;
}

/** 日時の緩いパース → ISO(タイムゾーン付)。"yyyy/MM/dd HH:mm" はJSTとみなす。失敗は null */
export function parseDateTimeLoose(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = toHankaku(String(s)).trim();
  if (!t) return null;
  const m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) {
    return `${m[1]}-${pad(m[2]!)}-${pad(m[3]!)}T${pad(m[4]!)}:${pad(m[5]!)}:${pad(m[6] ?? "00")}+09:00`;
  }
  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  return null;
}

/** 1セル多値（改行・読点・カンマ区切り）→ 配列（仕様書 11.2 / 正規化判断C） */
export function splitMultiValue(s: string | null | undefined): string[] {
  if (s == null) return [];
  return toHankaku(String(s))
    .split(/[\n、,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 最小CSVパーサ（ヘッダ行→オブジェクト配列。引用符・カンマ・改行に対応） */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM除去
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, idx) => (o[h] = (r[idx] ?? "").trim()));
    return o;
  });
}
