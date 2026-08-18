import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseDateLoose, addDays } from "@/lib/migrate/cleanse";
import { toWorkDate } from "@/lib/datekey";
import { fetchWorkbook, sheetObjects } from "@/lib/migrate/xlsx";
import { createDriverResolver } from "@/lib/migrate/roster";
import { importDrivers, importVehicles, importCustomers, importShiftLog } from "@/lib/migrate/import-xlsx";
import { importEventLog } from "@/lib/migrate/import-events";
import { recomputeAllMetrics } from "@/lib/migrate/recompute";
import { syncDispatchFromSheet, dispatchSheetCsvUrl } from "@/lib/operations/dispatch-sync";

type SB = SupabaseClient<Database>;

/**
 * 現行スプレッドシート → shoei-sys の「並行運用ミラー」。
 *   現行（Googleスプレッドシート）を"正"のまま、その内容を新システムへ片方向コピーする。
 *   既存の冪等インポータ（drivers/vehicles/客先/shift_log/event_log/配車）を再利用し、
 *   直近ウィンドウ（既定21日）だけを処理して1時間ごとの実行でも軽く保つ。
 *
 * 設定（環境変数, 未設定なら configured:false で何もしない）:
 *   MIRROR_SHEET_ID       … 勤怠ブックのスプレッドシートID（これだけでOK）
 *                           既定タブ名 drivers/vehicles/客先マスタ/shift_log/event_log を
 *                           シート名指定(gviz)で取得するため gid は不要。
 *   MIRROR_WINDOW_DAYS    … 直近何日ぶんを処理するか（既定 21）
 *   （任意）MIRROR_NAME_<KEY> … タブ名が異なる場合の上書き（KEY=DRIVERS/VEHICLES/CUSTOMERS/SHIFTLOG/EVENTLOG）
 *   （任意）MIRROR_GID_<KEY>  … gidで取得したい場合の上書き
 *   ※ 配車（運行データ/流れ表）は DISPATCH_SHEET_ID/GID（既存）を使い自動で一緒に取り込む。
 *   ※ シートは「リンクを知っている全員が閲覧可」で共有すること（CSVで読む）。
 */
export interface MirrorResult {
  configured: boolean;
  windowDays: number;
  cutoff?: string;
  drivers?: number;
  vehicles?: number;
  customers?: number;
  shiftsInserted?: number;
  shiftsSkipped?: number;
  events?: number;
  items?: number;
  eventsSkipped?: number;
  dispatchReplaced?: number;
  recomputed?: number;
  note?: string;
}

/** 勤怠ブックの xlsx エクスポートURL（シートIDだけでOK・gid不要）。 */
function xlsxUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
}

/** タブ名（MIRROR_NAME_<KEY> で上書き可）。 */
function sheetName(key: string, defaultName: string): string {
  return process.env[`MIRROR_NAME_${key}`]?.trim() || defaultName;
}

/** 直近ウィンドウ判定。日付が読めない行は落とさず通す（インポータ側で厳密判定）。 */
function inWindow(dateStr: string | null | undefined, cutoff: string): boolean {
  const d = parseDateLoose(dateStr);
  return d == null || d >= cutoff;
}

export async function mirrorFromSheets(sb: SB): Promise<MirrorResult> {
  const id = process.env.MIRROR_SHEET_ID?.trim();
  const windowDays = Number(process.env.MIRROR_WINDOW_DAYS ?? "21") || 21;
  const cutoff = addDays(toWorkDate(new Date()), -windowDays);
  const dispatchConfigured = !!(process.env.DISPATCH_SHEET_ID || process.env.DISPATCH_SHEET_CSV_URL || dispatchSheetCsvUrl());

  if (!id && !dispatchConfigured) {
    return { configured: false, windowDays, note: "MIRROR_SHEET_ID（勤怠ブック）も配車シートも未設定です。" };
  }

  const result: MirrorResult = { configured: true, windowDays, cutoff };
  let affectedDrivers: string[] = []; // 今回 新規勤務を入れたドライバー（この人だけ再計算）

  if (id) {
    // 勤怠ブックを xlsx で一括取得（CSVと違い日付がDate→cellStrでISO化され、移行と同じ形式で取り込める）
    const wb = await fetchWorkbook(xlsxUrl(id));
    const rowsOf = (key: string, name: string): Record<string, string>[] | null => {
      try {
        return sheetObjects(wb, sheetName(key, name));
      } catch (e) {
        console.warn(`[mirror] ${name} 取得スキップ: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    // 1) マスタ（小さいので全件 upsert）
    const dRows = rowsOf("DRIVERS", "drivers");
    if (dRows) result.drivers = await importDrivers(sb, dRows);
    const vRows = rowsOf("VEHICLES", "vehicles");
    if (vRows) result.vehicles = await importVehicles(sb, vRows);
    const cRows = rowsOf("CUSTOMERS", "客先マスタ");
    if (cRows) result.customers = await importCustomers(sb, cRows);

    const resolver = createDriverResolver(sb);
    await resolver.preload();

    // 2) shift_log → shifts（直近ウィンドウのみ・冪等）
    const sRows = rowsOf("SHIFTLOG", "shift_log");
    if (sRows) {
      const rows = sRows.filter((r) => inWindow(r["開始日"], cutoff));
      const sr = await importShiftLog(sb, rows, resolver);
      result.shiftsInserted = sr.inserted;
      result.shiftsSkipped = sr.skipped;
      affectedDrivers = sr.driverIds; // 新規勤務のあったドライバーだけ後で再計算
    }

    // 3) event_log → events (+ 明細)（直近ウィンドウのみ・冪等）
    const eRows = rowsOf("EVENTLOG", "event_log");
    if (eRows) {
      const rows = eRows.filter((r) => inWindow(r["server_ts"], cutoff));
      const ev = await importEventLog(sb, rows, resolver);
      result.events = ev.events;
      result.items = ev.items;
      result.eventsSkipped = ev.skipped;
    }
  }

  // 4) 配車（運行データ/流れ表）— 既存のシート取込を流用（積込日レンジのみ置換）
  if (dispatchConfigured) {
    try {
      const d = await syncDispatchFromSheet(sb);
      result.dispatchReplaced = d.replaced;
    } catch (e) {
      // 配車シート未共有などで失敗しても勤怠ミラーは成立させる
      result.note = `配車同期はスキップ: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // 5) 指標・違反 再計算（今回 新規勤務が入ったドライバーのみ＝差分で軽量）。
  //    勤怠指標は shifts から算出するため、新規 shift が無ければ再計算不要（毎時実行を60s以内に保つ）。
  if (affectedDrivers.length) {
    const m = await recomputeAllMetrics(sb, { driverIds: affectedDrivers });
    result.recomputed = m.shifts;
  } else {
    result.recomputed = 0;
  }

  return result;
}
