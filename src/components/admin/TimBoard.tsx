"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TimRow, TimEvent } from "@/lib/operations/tim-board";

/** イベント種別 → 見た目（現行GAS T・I・M の配色を踏襲）。 */
const TYPE_META: Record<string, { label: string; short: string; cls: string }> = {
  departure: { label: "出勤", short: "出勤", cls: "border-cyan-400 bg-cyan-50 text-cyan-700" },
  leg_departure: { label: "長距離再出発", short: "再出発", cls: "border-violet-400 bg-violet-50 text-violet-700" },
  arrival: { label: "到着", short: "到着", cls: "border-pink-400 bg-pink-50 text-pink-600" },
  loading: { label: "積込", short: "積込", cls: "border-green-500 bg-green-50 text-green-700" },
  unloading: { label: "荷卸", short: "荷卸", cls: "border-orange-400 bg-orange-50 text-orange-600" },
  long_rest: { label: "長距離休憩", short: "休憩", cls: "border-orange-500 bg-orange-500 text-white" },
  clock_out: { label: "退勤", short: "退勤", cls: "border-red-500 bg-red-500 text-white" },
  rest_start: { label: "休憩開始", short: "休入", cls: "border-slate-300 bg-slate-50 text-slate-600" },
  rest_end: { label: "休憩終了", short: "休了", cls: "border-slate-300 bg-slate-50 text-slate-600" },
};
const meta = (t: string) => TYPE_META[t] ?? { label: t, short: t.slice(0, 2), cls: "border-slate-300 bg-white text-slate-600" };

const STATUS: Record<string, { cell: string; badge: string; text: string }> = {
  working: { cell: "bg-green-100", badge: "bg-green-600", text: "稼働中" },
  finished: { cell: "bg-orange-100", badge: "bg-orange-500", text: "終業" },
  idle: { cell: "bg-white", badge: "bg-slate-400", text: "打刻のみ" },
};

function itemLine(e: TimEvent): string {
  const parts: string[] = [];
  for (const it of e.items) {
    const s = [it.delivery_spot, it.shipper, it.quantity, it.weight, it.cargo_type].filter(Boolean).join(" ");
    if (s) parts.push(s);
  }
  const head = e.customer || e.address || "";
  return [head, ...parts].filter(Boolean).join(" / ");
}

/** 1打刻の地図URL（座標優先・無ければ住所検索）。 */
function mapUrlForEvent(e: TimEvent): string | null {
  if (e.lat != null && e.lng != null) return `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`;
  if (e.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`;
  return null;
}
/** 当日の経路URL（座標が2点以上ならGoogleマップの経路、1点なら地点、無ければ最後の住所）。 */
function routeUrlForRow(r: TimRow): string | null {
  const pts = r.events.filter((e) => e.lat != null && e.lng != null).map((e) => `${e.lat},${e.lng}`);
  if (pts.length >= 2) return `https://www.google.com/maps/dir/${pts.join("/")}`;
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${pts[0]}`;
  const addr = [...r.events].reverse().find((e) => e.address)?.address;
  return addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
}

export function TimBoard({
  day,
  rows,
  prevDay,
  nextDay,
  lineSent,
  lineLimit,
}: {
  day: string;
  rows: TimRow[];
  prevDay: string;
  nextDay: string;
  lineSent: number;
  lineLimit: number | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<{ ev: TimEvent; name: string } | null>(null);
  const [live, setLive] = useState(false);

  // 即時反映（Supabase Realtime）: events の変化で盤面を再取得
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("tim-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => router.refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const label = `${day.slice(5, 7)}/${day.slice(8, 10)}`;

  return (
    <main className="mx-auto max-w-7xl p-4">
      {/* ヘッダ（現行 T・I・M 風・ポップ） */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-4 border-slate-900 bg-yellow-300 p-3 shadow-[4px_4px_0_0_#0f172a]">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black tracking-widest text-slate-900">T・I・M</span>
          <span className="hidden text-sm font-bold text-slate-700 sm:inline">運行管理パネル</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/tim?date=${prevDay}`} className="rounded-lg border-2 border-slate-900 bg-white px-3 py-1 text-lg font-bold shadow-[2px_2px_0_0_#0f172a]">◀</Link>
          <span className="min-w-[4.5rem] text-center text-xl font-black text-slate-900">{label}</span>
          <Link href={`/admin/tim?date=${nextDay}`} className="rounded-lg border-2 border-slate-900 bg-white px-3 py-1 text-lg font-bold shadow-[2px_2px_0_0_#0f172a]">▶</Link>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border-2 border-slate-900 bg-white px-3 py-1 text-center shadow-[2px_2px_0_0_#0f172a]">
            <div className="text-[10px] font-bold text-slate-500">LINE通知 当月</div>
            <div className="text-sm font-black tabular-nums">{lineSent}{lineLimit != null ? ` / ${lineLimit}` : ""}</div>
          </div>
          <button onClick={() => router.refresh()} className="rounded-lg border-2 border-slate-900 bg-white px-3 py-2 text-sm font-bold shadow-[2px_2px_0_0_#0f172a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            🔄 更新
          </button>
        </div>
      </header>

      <div className="mb-2 flex items-center gap-3 text-xs text-slate-500">
        <span className={`inline-flex items-center gap-1 ${live ? "text-green-600" : "text-slate-400"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} />
          {live ? "自動更新中（即時反映）" : "接続中…"}
        </span>
        <span>稼働 {rows.filter((r) => r.status === "working").length} / 終業 {rows.filter((r) => r.status === "finished").length} / 全 {rows.length} 名</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-400">{label} の打刻はまだありません</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-slate-900">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? STATUS.idle!;
                return (
                  <tr key={r.driverId} className="border-b-2 border-slate-900 last:border-b-0">
                    <td className={`sticky left-0 z-10 w-32 min-w-[8rem] border-r-2 border-slate-900 px-2 py-2 align-top ${st.cell}`}>
                      <div className="flex items-center gap-1 font-black leading-tight text-slate-900">
                        <span>{r.name}</span>
                        {r.lineUserId && <span title="LINE連携済み" className="text-sm leading-none">💬</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${st.badge}`}>{st.text}</span>
                        {r.code && <span className="text-[10px] text-slate-500">{r.code}</span>}
                      </div>
                      {routeUrlForRow(r) && (
                        <a href={routeUrlForRow(r)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded border border-slate-400 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50">
                          🗺️ 経路
                        </a>
                      )}
                    </td>
                    <td className="bg-slate-50 px-2 py-2">
                      <div className="flex flex-nowrap items-stretch gap-1.5">
                        {r.events.map((e) => {
                          const m = meta(e.type);
                          const sub = itemLine(e);
                          return (
                            <button
                              key={e.id}
                              onClick={() => setDetail({ ev: e, name: r.name })}
                              className={`shrink-0 rounded-lg border-2 px-2 py-1 text-left shadow-[2px_2px_0_0_rgba(15,23,42,0.25)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${m.cls}`}
                              title={`${m.label} ${e.time}`}
                            >
                              <div className="flex items-center gap-1 whitespace-nowrap text-xs font-black tabular-nums">
                                <span>{m.short} {e.time}</span>
                                {e.photos.length > 0 && <span title="写真あり">📷</span>}
                              </div>
                              {sub && <div className="mt-0.5 max-w-[9rem] truncate text-[10px] font-medium opacity-80">{sub}</div>}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        現行「T・I・M 運行管理パネル」の再現。行＝ドライバー、右＝当日の打刻（種別ごとに色分け）。打刻をタップで詳細。打刻された瞬間に自動で反映されます（GAS版の5分ごと更新より即時）。
      </p>

      {/* 詳細ポップアップ（showLogDetail 相当） */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-sm rounded-2xl border-4 border-slate-900 bg-white p-5 shadow-[6px_6px_0_0_#0f172a]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-baseline justify-between">
              <span className={`rounded-lg border-2 px-2 py-0.5 text-base font-black ${meta(detail.ev.type).cls}`}>{meta(detail.ev.type).label}</span>
              <span className="text-sm text-slate-500">{detail.name}</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div><b className="text-slate-500">時間</b> <span className="font-bold tabular-nums">{detail.ev.time}</span></div>
              <div><b className="text-slate-500">住所</b> <span className="break-words">{detail.ev.address || "（住所情報なし）"}</span></div>
              {detail.ev.lat != null && detail.ev.lng != null && (
                <div className="text-xs text-slate-400">座標 {detail.ev.lat.toFixed(6)}, {detail.ev.lng.toFixed(6)}</div>
              )}
              {detail.ev.customer && <div><b className="text-slate-500">客先</b> {detail.ev.customer}</div>}
              {detail.ev.items.map((it, i) => {
                const seg = [
                  it.delivery_spot && `着地 ${it.delivery_spot}`,
                  it.shipper && `荷主 ${it.shipper}`,
                  it.quantity && `数量 ${it.quantity}`,
                  it.weight && `重量 ${it.weight}`,
                  it.slip_no && `伝票 ${it.slip_no}`,
                  it.receipts && `受領書 ${it.receipts}`,
                  it.cargo_type && `品種 ${it.cargo_type}`,
                ].filter(Boolean).join(" / ");
                return seg ? <div key={i} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{seg}</div> : null;
              })}
              {detail.ev.note && <div><b className="text-slate-500">特記</b> {detail.ev.note}</div>}
              {detail.ev.photos.length > 0 && (
                <div>
                  <b className="text-slate-500">📷 写真（{detail.ev.photos.length}枚・タップで拡大）</b>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {detail.ev.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`写真${i + 1}`} className="h-24 w-full rounded-lg border-2 border-slate-300 object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {mapUrlForEvent(detail.ev) && (
                <a href={mapUrlForEvent(detail.ev)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-lg border-2 border-slate-900 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 shadow-[2px_2px_0_0_#0f172a]">
                  📍 地図で開く
                </a>
              )}
            </div>
            <button onClick={() => setDetail(null)} className="mt-4 w-full rounded-lg border-2 border-slate-900 bg-slate-900 py-2 font-bold text-white">閉じる</button>
          </div>
        </div>
      )}
    </main>
  );
}
