import type { LFBoard, LFDriver, LFJob } from "@/lib/operations/logiflow";

/**
 * 流れ表(LOGI-FLOW NAVI)の印刷用HTML。A4縦・1ドライバー=1行・案件は横並び（多い時のみ折り返し）。
 *   行はページ境界で分断しない（break-inside:avoid）。用紙幅に収まる compact レイアウト。
 */

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const WD = ["日", "月", "火", "水", "木", "金", "土"] as const;
/** "yyyy-mm-dd" → "M/D(曜)" */
function mdw(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return esc(d);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}(${WD[dt.getUTCDay()]})`;
}

function jobBox(j: LFJob, dateField: "plan" | "arrival"): string {
  const date = mdw(dateField === "arrival" ? j.arrivalDate : j.planDate);
  const time = j.arrivalTime && j.arrivalTime.trim() ? esc(j.arrivalTime) : "到着指定";
  const exp = j.express && j.express.trim() ? esc(j.express) : "高速指示";
  const veh = j.vehicleNo ? `<span class="jveh">車:${esc(j.vehicleNo)}</span> ` : "";
  return `<div class="job${j.isSubcontract ? " sub" : ""}">
    <div class="jdate">${date}</div>
    <div class="jroute">${veh}${esc(j.originSpot) || "—"} <span class="jarrow">→</span> ${esc(j.destSpot) || "—"}</div>
    <div class="jtime">${time}</div>
    <div class="jexp">${exp}</div>
  </div>`;
}

function driverRow(d: LFDriver): string {
  const am = d.amJobs.length
    ? d.amJobs.map((j) => jobBox(j, "plan")).join("")
    : `<div class="hold">START / PRE-LOAD<br>昭栄車庫</div>`;
  const flow = d.jobs.length ? d.jobs.map((j) => jobBox(j, "plan")).join("") : `<div class="hold">—</div>`;
  const next = d.nextDayJobs.length
    ? d.nextDayJobs.map((j) => jobBox(j, "arrival")).join("")
    : `<div class="hold">NEXT DAY<br>昭栄車庫(待機)</div>`;
  return `<tr>
    <td class="c-drv">
      <div class="belong">${esc(d.belong)}</div>
      <div class="dname">${esc(d.name)}</div>
      ${d.vehicle ? `<div class="dveh">${esc(d.vehicle)}</div>` : ""}
    </td>
    <td class="c-am"><div class="cellcol">${am}</div></td>
    <td class="c-flow"><div class="cellflex">${flow}</div></td>
    <td class="c-next"><div class="cellcol">${next}</div></td>
  </tr>`;
}

export function renderLogiFlowHtml(board: LFBoard): string {
  const rows = board.drivers.map(driverRow).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><style>
  @page { size: A4; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans","Noto Sans JP",sans-serif; font-size: 8px; color: #111; margin: 0; }
  .title { display:flex; align-items:baseline; gap:10px; margin:0 0 5px; }
  .title h1 { font-size: 14px; margin:0; letter-spacing:1px; }
  .title .date { font-size: 11px; font-weight:bold; }
  .title .cnt { margin-left:auto; font-size:10px; font-weight:bold; background:#c93b2b; color:#fff; padding:2px 8px; border-radius:3px; }
  table { width:100%; border-collapse: collapse; table-layout: fixed; }
  thead th { background:#111; color:#fff; font-size:8px; font-weight:bold; padding:3px; border:0.5px solid #333; text-align:center; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  td { border:0.5px solid #999; padding:2px 3px; vertical-align:top; overflow:hidden; }
  .c-drv{ width:11%; text-align:center; } .c-am{ width:19%; } .c-flow{ width:51%; } .c-next{ width:19%; }
  .belong{ font-size:7px; color:#666; }
  .dname{ font-weight:bold; font-size:11px; line-height:1.2; }
  .dveh{ display:inline-block; border:1px solid #111; border-radius:2px; padding:0 4px; font-size:9px; font-weight:bold; margin-top:1px; }
  /* 当日フロー=横並び(2列で折返し) / AM・翌日=縦積み(1件=セル幅いっぱい)。min-width:0 で列外へはみ出させない */
  .cellflex{ display:flex; flex-wrap:wrap; gap:3px; align-items:stretch; }
  .cellcol{ display:flex; flex-direction:column; gap:3px; }
  .job{ border:1px solid #bbb; border-radius:3px; padding:2px 3px; min-width:0; background:#fff; overflow:hidden; }
  .cellflex > .job{ flex:1 1 45%; max-width:100%; }
  .cellcol > .job{ width:100%; }
  .job.sub{ background:#fffbf0; border-color:#e0c890; }
  .jdate{ font-size:7px; color:#666; }
  .jroute{ font-weight:bold; line-height:1.25; word-break:break-all; }
  .jarrow{ color:#c93b2b; font-weight:bold; }
  .jveh{ color:#c93b2b; font-weight:bold; }
  .jtime{ font-size:8px; text-align:center; background:#f1f5f9; border-radius:2px; margin-top:1px; }
  .jexp{ font-size:7px; text-align:center; background:#eef2ff; border-radius:2px; margin-top:1px; }
  .hold{ color:#94a3b8; font-size:8px; font-weight:bold; text-align:center; padding:4px 0; }
  </style></head><body>
  <div class="title"><h1>LOGI-FLOW ／ 流れ表</h1><span class="date">${mdw(board.date)}</span><span class="cnt">当日 ${board.totalJobs} 件</span></div>
  <table>
    <thead><tr><th class="c-drv">DRIVER</th><th class="c-am">AM（前日継続）</th><th class="c-flow">当日フロー</th><th class="c-next">翌日</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="text-align:center;padding:20px;color:#888">${esc(board.date)} の配車はありません</td></tr>`}</tbody>
  </table>
  </body></html>`;
}
