import ExcelJS from "exceljs";

/**
 * xlsx セル値を文字列へ正規化（移行用）。
 * - Date(年<1901)=時刻のみ → "HH:mm"
 * - Date(年>=1901)=日付/日時 → "yyyy-MM-dd HH:mm:ss"（Excelはnaive、UTC成分がJST実時刻）
 * - リッチテキスト/ハイパーリンク/数式 → text/result/hyperlink を採用
 */
export function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    if (v.getUTCFullYear() < 1901) return `${p(v.getUTCHours())}:${p(v.getUTCMinutes())}`;
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.result === "string") return o.result;
    if (typeof o.hyperlink === "string") return o.hyperlink;
    if (Array.isArray(o.richText)) return o.richText.map((t) => (t as { text?: string }).text ?? "").join("");
    return "";
  }
  return String(v);
}

/** "yyyy-MM-dd[ HH:mm[:ss]]" → JST ISO（+09:00）。失敗は null。 */
export function toJstIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s.trim());
  if (!m) return null;
  const h = (m[4] ?? "00").padStart(2, "0");
  return `${m[1]}-${m[2]}-${m[3]}T${h}:${m[5] ?? "00"}:${m[6] ?? "00"}+09:00`;
}

/** ワークブックのシート名一覧。 */
export async function workbookSheets(file: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((w) => w.name);
}

/** 指定シートを「ヘッダ→値」のオブジェクト配列として読む（headerRow 行をヘッダとする）。 */
export async function loadSheetObjects(
  file: string,
  sheet: string,
  headerRow = 1,
): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`シートが見つかりません: ${sheet}`);

  const headers: string[] = [];
  const hRow = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) headers[c] = cellStr(hRow.getCell(c).value).trim();

  const out: Record<string, string>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const o: Record<string, string> = {};
    let any = false;
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = headers[c];
      if (!h) continue;
      const val = cellStr(row.getCell(c).value).trim();
      o[h] = val;
      if (val) any = true;
    }
    if (any) out.push(o);
  }
  return out;
}
