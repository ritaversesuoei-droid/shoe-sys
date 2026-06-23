import { formatMinutesToHHMM } from "@/lib/time";

/**
 * 運行日報 PDF 用 HTML テンプレート（仕様書 F-17）。
 * 1運行1枚・B5横。乗務員/車両/出退勤/拘束/運行明細/走行メーター/休憩仮眠/特記/運行可否/確認印。
 * ブラウザ(Chrome)で描画するため日本語は端末フォントで表示される。
 */

export interface PdfLeg {
  seq: number;
  shipper?: string | null;
  origin_spot?: string | null;
  destination_spot?: string | null;
  cargo?: string | null;
  receipts?: string | null;
  meter?: number | null;
}
export interface PdfRest {
  rest_type: "rest" | "sleep";
  place?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  duration_min?: number | null;
}
export interface DailyReportPdfData {
  reportDate: string;
  driverName: string;
  driverCode?: string | null;
  vehicleNo?: string | null;
  crew?: string | null;
  departureAt?: string | null;
  returnAt?: string | null;
  meterStart?: number | null;
  meterEnd?: number | null;
  restraintMin?: number | null;
  legs: PdfLeg[];
  rests: PdfRest[];
  notes?: string | null;
  drivable?: boolean | null;
}

function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ISO → JST "MM/DD HH:mm" */
function jst(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function renderDailyReportHtml(data: DailyReportPdfData): string {
  const meterDist =
    data.meterStart != null && data.meterEnd != null
      ? data.meterEnd - data.meterStart
      : null;

  const legRows = data.legs.length
    ? data.legs
        .map(
          (l) => `<tr>
        <td class="c">${esc(l.seq)}</td>
        <td>${esc(l.shipper)}</td>
        <td>${esc(l.origin_spot)}</td>
        <td>${esc(l.destination_spot)}</td>
        <td>${esc(l.cargo)}</td>
        <td class="c">${esc(l.receipts)}</td>
        <td class="r">${l.meter != null ? esc(l.meter) : ""}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td class="c" colspan="7">（運行明細なし）</td></tr>`;

  const restRows = data.rests.length
    ? data.rests
        .map(
          (r) => `<tr>
        <td class="c">${r.rest_type === "sleep" ? "睡眠" : "休憩"}</td>
        <td>${esc(r.place)}</td>
        <td class="c">${jst(r.start_at)}</td>
        <td class="c">${jst(r.end_at)}</td>
        <td class="r">${r.duration_min != null ? formatMinutesToHHMM(r.duration_min) : ""}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td class="c" colspan="5">（休憩記録なし）</td></tr>`;

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>
  @page { size: 257mm 182mm; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #111; font-size: 10px; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 6px; text-align: center; letter-spacing: 2px; }
  .head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .box { border: 1px solid #333; padding: 4px 6px; }
  .head .box { flex: 1; }
  .label { color: #555; font-size: 8px; }
  .val { font-size: 11px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #444; padding: 2px 4px; font-size: 9px; }
  th { background: #eee; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  .two { display: flex; gap: 8px; }
  .two > div { flex: 1; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px; }
  .sign { border: 1px solid #333; width: 120px; height: 40px; text-align: center; }
  .sign .label { padding-top: 2px; }
</style></head>
<body>
  <h1>運　行　日　報</h1>
  <div class="head">
    <div class="box"><div class="label">運行日</div><div class="val">${esc(data.reportDate)}</div></div>
    <div class="box"><div class="label">乗務員</div><div class="val">${esc(data.driverName)}${data.driverCode ? `（${esc(data.driverCode)}）` : ""}</div></div>
    <div class="box"><div class="label">車番</div><div class="val">${esc(data.vehicleNo)}</div></div>
    <div class="box"><div class="label">出庫 / 帰庫</div><div class="val">${jst(data.departureAt)} 〜 ${jst(data.returnAt)}</div></div>
    <div class="box"><div class="label">拘束時間</div><div class="val">${data.restraintMin != null ? formatMinutesToHHMM(data.restraintMin) : ""}</div></div>
  </div>

  <table>
    <thead><tr><th style="width:6%">No</th><th>荷主</th><th>発地</th><th>着地</th><th>物積</th><th style="width:8%">受領書</th><th style="width:12%">メーター</th></tr></thead>
    <tbody>${legRows}</tbody>
  </table>

  <div class="two">
    <table>
      <thead><tr><th style="width:14%">区分</th><th>場所</th><th style="width:18%">開始</th><th style="width:18%">終了</th><th style="width:14%">時間</th></tr></thead>
      <tbody>${restRows}</tbody>
    </table>
    <table style="max-width:36%">
      <tbody>
        <tr><th>開始メーター</th><td class="r">${data.meterStart != null ? esc(data.meterStart) : ""}</td></tr>
        <tr><th>終了メーター</th><td class="r">${data.meterEnd != null ? esc(data.meterEnd) : ""}</td></tr>
        <tr><th>走行距離</th><td class="r">${meterDist != null ? esc(meterDist) : ""}</td></tr>
        <tr><th>運行可否</th><td class="c">${data.drivable === false ? "否" : "可"}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="box" style="min-height:24px"><span class="label">特記事項</span> ${esc(data.notes)}</div>

  <div class="foot">
    <div class="label">昭栄運輸　運行・勤怠管理システム</div>
    <div style="display:flex; gap:8px">
      <div class="sign"><div class="label">運転者</div></div>
      <div class="sign"><div class="label">運行管理者 確認印</div></div>
    </div>
  </div>
</body></html>`;
}
