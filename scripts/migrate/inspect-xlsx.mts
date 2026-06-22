/**
 * xlsx 構造インスペクタ。実行: node --import tsx scripts/migrate/inspect-xlsx.mts
 *   各対象シートのヘッダ行＋データ2行（値と型）を表示し、列構造・日付/時刻の型を把握する。
 */
import ExcelJS from "exceljs";
import { join } from "node:path";

const DIR = "./migration/input";
const TARGETS: [string, string[]][] = [
  ["第２段からの構築用（勤怠管理）  (1).xlsx", ["drivers", "vehicles", "客先マスタ", "shift_log", "event_log", "daily_reports", "警告まとめ", "system_config", "修正入力"]],
  ["TROUD_DATA for 流れ表.xlsx", ["運行データ", "ドライバーリスト"]],
];

function cellInfo(v: unknown): string {
  if (v == null) return "∅";
  if (v instanceof Date) return `Date(${v.toISOString()})`;
  if (typeof v === "object") return `obj(${JSON.stringify(v).slice(0, 40)})`;
  return `${typeof v}:${String(v).slice(0, 28)}`;
}

async function main() {
  for (const [fileName, sheets] of TARGETS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(DIR, fileName));
    console.log(`\n############ ${fileName} ############`);
    for (const name of sheets) {
      const ws = wb.getWorksheet(name);
      if (!ws) { console.log(`\n== ${name} == (見つかりません)`); continue; }
      console.log(`\n== ${name} ==  行数:${ws.rowCount} 列数:${ws.columnCount}`);
      const maxRows = Math.min(ws.rowCount, 4);
      for (let r = 1; r <= maxRows; r++) {
        const row = ws.getRow(r);
        const vals: string[] = [];
        const n = Math.min(ws.columnCount, 14);
        for (let c = 1; c <= n; c++) vals.push(cellInfo(row.getCell(c).value));
        console.log(`  R${r}: ${vals.join(" | ")}`);
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
