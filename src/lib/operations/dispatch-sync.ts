import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCsvRows } from "@/lib/migrate/cleanse";
import { createDriverResolver } from "@/lib/migrate/roster";
import { buildDispatchPayload } from "@/lib/migrate/dispatch-map";

type SB = SupabaseClient<Database>;

// 「TROUD_DATA for 流れ表」スプレッドシート（リンク閲覧可で公開・CSVエクスポート）。
const DEFAULT_SHEET_ID = "1yXWWA-wAyUyX2NCrmMcf5RkTCLUonWHPwQH9a39iH6Y";

/** 流れ表シートの CSV エクスポートURL（env で上書き可）。 */
export function dispatchSheetCsvUrl(): string {
  if (process.env.DISPATCH_SHEET_CSV_URL) return process.env.DISPATCH_SHEET_CSV_URL;
  const id = process.env.DISPATCH_SHEET_ID ?? DEFAULT_SHEET_ID;
  const gid = process.env.DISPATCH_SHEET_GID ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export interface DispatchSyncResult {
  fetched: number;      // シートのデータ行数（ヘッダ除く）
  replaced: number;     // 置き換えた（挿入した）件数
  skipped: number;      // 積込日が読めずスキップ
  driversLinked: number; // 名寄せで新規作成した自社ドライバー数
  from: string | null;  // 反映した積込日レンジ
  to: string | null;
}

/**
 * TROUD由来の「流れ表」Googleスプレッドシート(CSV)を取得し dispatch_plans を最新化する。
 *   - 認証情報不要（シートはリンク閲覧可で公開）。書込みは service_role で行うこと。
 *   - シートに含まれる積込日レンジ [from,to] だけを置換し、範囲外の履歴は保持する（全消しにしない）。
 */
export async function syncDispatchFromSheet(
  sb: SB,
  opts: { url?: string } = {},
): Promise<DispatchSyncResult> {
  const url = opts.url ?? dispatchSheetCsvUrl();
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`流れ表シートの取得に失敗しました (HTTP ${res.status})`);
  const csv = await res.text();

  // CSVでなくログイン/権限HTMLが返っていないか確認（共有設定ミスの早期検知）
  const head = csv.slice(0, 300);
  if (head.trimStart().startsWith("<") || !/所属|ドライバー/.test(head)) {
    throw new Error(
      "シートをCSVで取得できませんでした。共有設定が『リンクを知っている全員が閲覧可』かご確認ください。",
    );
  }

  const rows = parseCsvRows(csv);
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c && c.trim()));
  return applyDispatchRows(sb, dataRows);
}

/**
 * 配車の行データ → dispatch_plans に反映する共通処理（シートCSV・TROUD直連携JSONの両方から使用）。
 * 行の列順: [0所属, 1ドライバー名, 2携帯, 3車両NO, 4積込日, 5荷主, 6積地, 7着荷日, 8着荷地, 9注意, 10高速, 11表示順]。
 * 積込日レンジのみ置換し、範囲外の履歴は保持する。
 */
export async function applyDispatchRows(sb: SB, dataRows: string[][]): Promise<DispatchSyncResult> {
  const resolver = createDriverResolver(sb);
  await resolver.preload();
  const { payload, skipped, dates } = await buildDispatchPayload(dataRows, resolver);

  const sorted = [...dates].sort();
  const from = sorted[0] ?? null;
  const to = sorted[sorted.length - 1] ?? null;

  if (from && to) {
    const { error: delErr } = await sb
      .from("dispatch_plans")
      .delete()
      .gte("plan_date", from)
      .lte("plan_date", to);
    if (delErr) throw delErr;
  }

  let replaced = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await sb.from("dispatch_plans").insert(chunk);
    if (error) throw error;
    replaced += chunk.length;
  }

  return { fetched: dataRows.length, replaced, skipped, driversLinked: resolver.created(), from, to };
}
