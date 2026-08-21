"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TimRow, TimEvent, TimItem } from "@/lib/operations/tim-board";

/** イベント種別 → 見た目（現行GAS T・I・M の配色を踏襲）。label=詳細用の正式名、short=一覧用。 */
const TYPE_META: Record<string, { label: string; short: string; cls: string }> = {
  departure: { label: "出勤", short: "出勤", cls: "border-cyan-400 bg-cyan-50 text-cyan-700" },
  leg_departure: { label: "長距離再出発", short: "再出発", cls: "border-violet-400 bg-violet-50 text-violet-700" },
  arrival: { label: "到着報告", short: "到着", cls: "border-pink-400 bg-pink-50 text-pink-600" },
  loading: { label: "積込完了", short: "積込", cls: "border-green-500 bg-green-50 text-green-700" },
  unloading: { label: "荷卸完了", short: "荷卸", cls: "border-orange-400 bg-orange-50 text-orange-600" },
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

/** 数値なら単位を付ける（"2587"→"2587kg"、既に単位付き/非数値はそのまま）。 */
function withUnit(v: string | null, unit: string): string {
  if (!v) return "";
  return /^[\d.]+$/.test(v.trim()) ? `${v}${unit}` : v;
}
/** 空/未入力は "0" として表示する（0なら0で見せる）。 */
function num(v: string | null | undefined): string {
  return v && v.trim() !== "" ? v : "0";
}

/**
 * 一覧カード用サマリ。積込＝数量/重量/伝票、荷卸＝受領書 を「0でも」必ず表示する。
 * その他の種別は明細があれば簡易表示。
 */
function itemMetrics(e: TimEvent): string {
  if (e.type === "loading") {
    const its = e.items.length ? e.items : [null];
    return its
      .map((it) => `数${num(it?.quantity)} 重${withUnit(num(it?.weight), "kg")} 伝${withUnit(num(it?.slip_no), "枚")}`)
      .join(" / ");
  }
  if (e.type === "unloading") {
    const its = e.items.length ? e.items : [null];
    return its.map((it) => `受領書${withUnit(num(it?.receipts), "枚")}`).join(" / ");
  }
  return e.items
    .map((it) => [it.delivery_spot, it.shipper, it.quantity, it.weight, it.cargo_type].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" / ");
}

const EMPTY_ITEM: TimItem = {
  shipper: null, delivery_spot: null, quantity: null, weight: null, cargo_type: null, receipts: null, slip_no: null,
};

/** 一覧カードの見出し（場所）。荷卸は住所ではなく「完了」対象（delivery_spot）を表示する。 */
function placeFor(e: TimEvent): string {
  if (e.type === "unloading") {
    const dests = e.items.map((it) => it.delivery_spot).filter(Boolean).join(" / ");
    if (dests) return `完了: ${dests}`;
    if (e.note) return e.note.replace(/^【?完了[:：]\s*/, "完了: ").replace(/】$/, ""); // 【完了: ○○】→ 完了: ○○
    return e.address || "";
  }
  return e.customer || e.address || "";
}
/** 詳細ポップアップの明細1行（種別ごと・数量/受領書は0でも表示）。 */
function detailItemSegs(e: TimEvent, it: TimItem): string {
  if (e.type === "loading") {
    return [
      `【数量】 ${num(it.quantity)}`,
      `【重量】 ${withUnit(num(it.weight), "kg")}`,
      `【伝票】 ${withUnit(num(it.slip_no), "枚")}`,
      it.delivery_spot && `【着地】 ${it.delivery_spot}`,
      it.shipper && `【荷主】 ${it.shipper}`,
      it.cargo_type && `【品種】 ${it.cargo_type}`,
    ].filter(Boolean).join(" / ");
  }
  if (e.type === "unloading") {
    return [
      `【受領書】 ${withUnit(num(it.receipts), "枚")}`,
      it.delivery_spot && `【完了】 ${it.delivery_spot}`,
      it.cargo_type && `【品種】 ${it.cargo_type}`,
    ].filter(Boolean).join(" / ");
  }
  return [
    it.quantity && `【数量】 ${it.quantity}`,
    it.weight && `【重量】 ${withUnit(it.weight, "kg")}`,
    it.slip_no && `【伝票】 ${withUnit(it.slip_no, "枚")}`,
    it.receipts && `【受領書】 ${withUnit(it.receipts, "枚")}`,
    it.delivery_spot && `【着地】 ${it.delivery_spot}`,
    it.shipper && `【荷主】 ${it.shipper}`,
    it.cargo_type && `【品種】 ${it.cargo_type}`,
  ].filter(Boolean).join(" / ");
}

/** 1打刻の地図URL（座標優先・無ければ住所検索）。 */
function mapUrlForEvent(e: TimEvent): string | null {
  if (e.lat != null && e.lng != null) return `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`;
  if (e.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`;
  return null;
}

/** ドライバー1行ぶんの打刻ストリップ。最新が右端＝初期表示で右端までスクロールし、左へ遡れる。 */
function EventsStrip({ events, name, onOpen }: { events: TimEvent[]; name: string; onOpen: (d: { ev: TimEvent; name: string }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth; // 最新（右端）を表示
  }, [events]);
  return (
    <div ref={ref} className="flex-1 overflow-x-auto bg-slate-50 px-2 py-2">
      <div className="flex flex-nowrap items-stretch gap-1.5">
        {events.length === 0 ? (
          <span className="px-2 py-3 text-xs text-slate-400">打刻なし</span>
        ) : (
          events.map((e) => {
            const m = meta(e.type);
            const place = placeFor(e);
            const metricsStr = itemMetrics(e);
            return (
              <button
                key={e.id}
                onClick={() => onOpen({ ev: e, name })}
                className={`w-[11.5rem] shrink-0 rounded-lg border-2 px-2 py-1.5 text-left shadow-[2px_2px_0_0_rgba(15,23,42,0.25)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${m.cls}`}
                title={`${m.label} ${e.time}`}
              >
                <div className="flex items-center gap-1 whitespace-nowrap text-xs font-black tabular-nums">
                  <span>{m.short} {e.time}</span>
                  {e.photos.length > 0 && <span title="写真あり">📷</span>}
                </div>
                {place && <div className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight opacity-80">{place}</div>}
                {metricsStr && <div className="mt-0.5 text-[10px] font-bold leading-tight">{metricsStr}</div>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
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

  // LINE月次上限の編集
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState(lineLimit != null ? String(lineLimit) : "");
  const [savingLimit, setSavingLimit] = useState(false);

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

  async function saveLimit() {
    setSavingLimit(true);
    try {
      const n = parseInt(limitInput, 10);
      const value = { monthly_limit: Number.isFinite(n) && n > 0 ? n : null };
      const res = await fetch("/api/admin/settings/line", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setEditingLimit(false);
      router.refresh();
    } catch {
      /* 失敗時はそのまま */
    } finally {
      setSavingLimit(false);
    }
  }

  const label = `${day.slice(5, 7)}/${day.slice(8, 10)}`;
  const overLimit = lineLimit != null && lineSent >= lineLimit;

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
          {/* LINE通知 当月（上限は編集可・件数は月ごとにリセット） */}
          <div className={`rounded-lg border-2 border-slate-900 px-3 py-1 text-center shadow-[2px_2px_0_0_#0f172a] ${overLimit ? "bg-red-100" : "bg-white"}`}>
            <div className="text-[10px] font-bold text-slate-500">LINE通知 当月</div>
            {editingLimit ? (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-sm font-black tabular-nums">{lineSent} /</span>
                <input
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="上限"
                  className="w-14 rounded border border-slate-400 px-1 py-0.5 text-sm"
                />
                <button onClick={saveLimit} disabled={savingLimit} className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-50">
                  {savingLimit ? "…" : "保存"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setLimitInput(lineLimit != null ? String(lineLimit) : ""); setEditingLimit(true); }}
                className={`text-sm font-black tabular-nums ${overLimit ? "text-red-600" : ""}`}
                title="クリックで月次上限を設定"
              >
                {lineSent}{lineLimit != null ? ` / ${lineLimit}` : " / —"} <span className="text-[9px] font-bold text-slate-400">✎上限</span>
              </button>
            )}
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
        <div className="overflow-hidden rounded-2xl border-2 border-slate-900">
          {rows.map((r) => {
            const st = STATUS[r.status] ?? STATUS.idle!;
            return (
              <div key={r.driverId} className="flex border-b-2 border-slate-900 last:border-b-0">
                {/* ドライバー（経路リンクは廃止） */}
                <div className={`w-32 shrink-0 border-r-2 border-slate-900 px-2 py-2 align-top ${st.cell}`}>
                  <div className="flex items-center gap-1 font-black leading-tight text-slate-900">
                    <span>{r.name}</span>
                    {r.lineUserId && <span title="LINE連携済み" className="text-sm leading-none">💬</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${st.badge}`}>{st.text}</span>
                    {r.code && <span className="text-[10px] text-slate-500">{r.code}</span>}
                  </div>
                </div>
                {/* 打刻タイムライン（最新が右・左へスクロールで遡る） */}
                <EventsStrip events={r.events} name={r.name} onOpen={setDetail} />
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        現行「T・I・M 運行管理パネル」の再現。行＝ドライバー、右が最新の打刻（左へスクロールで遡れます）。打刻をタップで詳細。打刻された瞬間に自動反映。
      </p>

      {/* 詳細ポップアップ（showLogDetail 相当・情報量を拡充） */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-sm rounded-2xl border-4 border-slate-900 bg-white p-5 shadow-[6px_6px_0_0_#0f172a]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-baseline gap-2">
              <span className={`rounded-lg border-2 px-2 py-0.5 text-base font-black ${meta(detail.ev.type).cls}`}>{meta(detail.ev.type).label}</span>
              <span className="text-base font-bold text-slate-800">{detail.name}</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div><b className="text-slate-500">【時間】</b> <span className="font-bold tabular-nums">{detail.ev.time}</span></div>
              <div><b className="text-slate-500">【場所】</b> <span className="break-words">{detail.ev.address || "（住所情報なし）"}</span></div>
              {detail.ev.customer && <div><b className="text-slate-500">【客先】</b> {detail.ev.customer}</div>}
              {(detail.ev.items.length
                ? detail.ev.items
                : detail.ev.type === "loading" || detail.ev.type === "unloading"
                  ? [EMPTY_ITEM]
                  : []
              ).map((it, i) => {
                const seg = detailItemSegs(detail.ev, it);
                return seg ? <div key={i} className="rounded bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700">{seg}</div> : null;
              })}
              {detail.ev.checks && <div><b className="text-slate-500">【点検】</b> {detail.ev.checks}</div>}
              {detail.ev.note && <div><b className="text-slate-500">【特記】</b> {detail.ev.note}</div>}
              {detail.ev.lat != null && detail.ev.lng != null && (
                <div className="text-xs text-slate-400">座標 {detail.ev.lat.toFixed(6)}, {detail.ev.lng.toFixed(6)}</div>
              )}
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
