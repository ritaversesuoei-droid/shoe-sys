import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCsv, parseDateLoose, addDays } from "@/lib/migrate/cleanse";
import { toWorkDate } from "@/lib/datekey";
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
 *   MIRROR_SHEET_ID       … 勤怠ブックのスプレッドシートID（drivers/vehicles/客先/shift_log/event_log を含む）
 *   MIRROR_GID_DRIVERS    … drivers タブの gid
 *   MIRROR_GID_VEHICLES   … vehicles タブの gid
 *   MIRROR_GID_CUSTOMERS  … 客先マスタ タブの gid
 *   MIRROR_GID_SHIFTLOG   … shift_log タブの gid
 *   MIRROR_GID_EVENTLOG   … event_log タブの gid
 *   MIRROR_WINDOW_DAYS    … 直近何日ぶんを処理するか（既定 21）
 *   ※ 配車（運行データ/流れ表）は DISPATCH_SHEET_ID/GID（既存）を使い自動で一緒に取り込む。
 *   ※ シートは「リンクを知っている全員が閲覧可」で共有すること（CSVエクスポートで読む）。
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

function csvUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function fetchRows(url: string, label: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`${label} の取得に失敗しました (HTTP ${res.status})`);
  const csv = await res.text();
  const head = csv.slice(0, 300);
  if (head.trimStart().startsWith("<")) {
    throw new Error(`${label} をCSVで取得できませんでした。共有設定を『リンクを知っている全員が閲覧可』にしてください。`);
  }
  return parseCsv(csv);
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

  if (id) {
    const gid = (name: string) => process.env[`MIRROR_GID_${name}`]?.trim();
    const gDrivers = gid("DRIVERS");
    const gVehicles = gid("VEHICLES");
    const gCustomers = gid("CUSTOMERS");
    const gShift = gid("SHIFTLOG");
    const gEvent = gid("EVENTLOG");

    // 1) マスタ（小さいので全件 upsert）
    if (gDrivers) result.drivers = await importDrivers(sb, await fetchRows(csvUrl(id, gDrivers), "drivers"));
    if (gVehicles) result.vehicles = await importVehicles(sb, await fetchRows(csvUrl(id, gVehicles), "vehicles"));
    if (gCustomers) result.customers = await importCustomers(sb, await fetchRows(csvUrl(id, gCustomers), "客先マスタ"));

    const resolver = createDriverResolver(sb);
    await resolver.preload();

    // 2) shift_log → shifts（直近ウィンドウのみ・冪等）
    if (gShift) {
      const rows = (await fetchRows(csvUrl(id, gShift), "shift_log")).filter((r) => inWindow(r["開始日"], cutoff));
      const sr = await importShiftLog(sb, rows, resolver);
      result.shiftsInserted = sr.inserted;
      result.shiftsSkipped = sr.skipped;
    }

    // 3) event_log → events (+ 明細)（直近ウィンドウのみ・冪等）
    if (gEvent) {
      const rows = (await fetchRows(csvUrl(id, gEvent), "event_log")).filter((r) => inWindow(r["server_ts"], cutoff));
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

  // 5) 指標・違反 再計算（直近に勤務のあるドライバーのみ＝差分で軽量）
  const { data: recent } = await sb.from("shifts").select("driver_id").gte("work_date", cutoff);
  const driverIds = [...new Set((recent ?? []).map((r) => r.driver_id).filter((v): v is string => !!v))];
  if (driverIds.length) {
    const m = await recomputeAllMetrics(sb, { driverIds });
    result.recomputed = m.shifts;
  }

  return result;
}
