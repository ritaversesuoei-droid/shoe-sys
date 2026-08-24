"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * ドライバーメニュー（現行GAS index画面の忠実再現）。
 *   - フルワイド縦積みボタン・カード枠・実機の配色/絵文字/文言
 *   - 出勤報告→「通常出勤/長距離再出発」、退勤報告→「通常退勤/長距離休憩」の選択ダイアログ（消し込み）
 *   - 今日の履歴はインライン展開（時刻＋内容）
 */

interface EvItem {
  shipper?: string | null;
  delivery_spot?: string | null;
  quantity?: string | null;
  weight?: string | null;
  cargo_type?: string | null;
  receipts?: string | null;
  slip_no?: string | null;
}
interface Ev {
  id: string;
  event_type: string;
  occurred_at: string;
  address: string | null;
  event_items: EvItem[] | null;
}

const HIST_LABEL: Record<string, string> = {
  departure: "出勤",
  leg_departure: "長距離再出発",
  arrival: "到着報告",
  loading: "積込完了",
  unloading: "荷卸完了",
  long_rest: "長距離休憩",
  clock_out: "退勤",
  rest_start: "休憩開始",
  rest_end: "休憩終了",
};

function hhmm(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 履歴の明細行（積込=重量/伝票、荷卸=受領書。枚数は赤字で強調）。 */
function renderDetail(e: Ev) {
  if (e.event_type === "loading") {
    const its = e.event_items && e.event_items.length ? e.event_items : [{}];
    return its.map((it, idx) => (
      <div key={idx} className="mt-1 text-sm text-slate-600">
        {it.quantity ? <>📦数:{it.quantity} / </> : null}
        ⚖重:{it.weight || "0"} / 📄伝:<span className="font-bold text-red-600">{it.slip_no || "0"}枚</span>
      </div>
    ));
  }
  if (e.event_type === "unloading") {
    const its = e.event_items && e.event_items.length ? e.event_items : [{}];
    return its.map((it, idx) => (
      <div key={idx} className="mt-1 text-sm text-slate-600">
        ✅ 受領書: <span className="font-bold text-red-600">{it.receipts || "0"}枚</span>
        {it.cargo_type ? <> / 品:{it.cargo_type}</> : null}
      </div>
    ));
  }
  return null;
}

// 実機の配色（スクショ準拠）
const MENU: { key: string; label: string; bg: string; dialog?: "departure" | "clock_out" | "arrival"; href?: string }[] = [
  { key: "departure", label: "☀️ 出勤報告", bg: "#4285f4", dialog: "departure" },
  { key: "arrival", label: "📍 到着報告", bg: "#4caf50", dialog: "arrival" },
  { key: "loading", label: "📦 積込完了(詳細)", bg: "#3d9aa5", href: "/driver/punch/loading" },
  { key: "unloading", label: "🏭 荷卸完了(詳細)", bg: "#6320ee", href: "/driver/punch/unloading" },
  { key: "clock_out", label: "🌙 退勤報告", bg: "#d9534f", dialog: "clock_out" },
  { key: "report", label: "📝 日報作成（乗務記録）", bg: "#455a64", href: "/driver/report" },
];

export function DriverMenu({ name, showRest }: { name: string; showRest: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "departure" | "clock_out" | "arrival">(null);
  const [histOpen, setHistOpen] = useState(false);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // 到着報告（その場ポップで直接送信）
  const [arrCoords, setArrCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [arrSubmitting, setArrSubmitting] = useState(false);
  const [arrErr, setArrErr] = useState<string | null>(null);
  const [arrDone, setArrDone] = useState(false);
  // 到着報告の冪等キーは「ダイアログを開くたび」に固定（毎回 randomUUID だと二度押し・
  //   失敗リトライで別キーになり重複到着になる）。同一キーの再送はサーバ側で重複排除される。
  const arrKeyRef = useRef<string | null>(null);
  const arrBusyRef = useRef(false);

  function openDialog(d: "departure" | "clock_out" | "arrival") {
    setDialog(d);
    if (d === "arrival") {
      setArrCoords(null);
      setArrErr(null);
      setArrDone(false);
      arrKeyRef.current = crypto.randomUUID(); // この到着報告に固定する冪等キー
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => setArrCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => {},
          { enableHighAccuracy: true, timeout: 8000 },
        );
      }
    }
  }
  function closeDialog() {
    setDialog(null);
    setArrErr(null);
    setArrDone(false);
  }
  async function submitArrival() {
    if (arrBusyRef.current) return; // 二度押しは即return
    arrBusyRef.current = true;
    setArrSubmitting(true);
    setArrErr(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: arrKeyRef.current ?? crypto.randomUUID(),
          event_type: "arrival",
          occurred_at: new Date().toISOString(),
          lat: arrCoords?.lat,
          lng: arrCoords?.lng,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "送信に失敗しました");
      setArrDone(true);
      setEvents(null); // 履歴は次回開いたとき再取得
      router.refresh();
    } catch (e) {
      setArrErr(e instanceof Error ? e.message : String(e));
    } finally {
      arrBusyRef.current = false;
      setArrSubmitting(false);
    }
  }

  async function toggleHist() {
    const next = !histOpen;
    setHistOpen(next);
    if (next && !events) {
      setHistLoading(true);
      try {
        const r = await fetch("/api/events/today");
        const d = await r.json();
        if (d.success) setEvents(d.events as Ev[]);
      } catch {
        /* 履歴取得失敗は無視 */
      } finally {
        setHistLoading(false);
      }
    }
  }

  async function changeName() {
    setBusy(true);
    await createClient().auth.signOut();
    router.refresh();
  }

  const go = (href: string) => router.push(href);
  const btn = "w-full rounded-2xl py-5 text-center text-xl font-bold text-white shadow-md active:translate-y-[1px]";

  return (
    <main className="min-h-dvh bg-slate-100 p-3">
      <div className="mx-auto max-w-md rounded-[28px] bg-white p-5 shadow-lg">
        {/* ヘッダ */}
        <div className="mb-4 flex items-center justify-between">
          <span className="font-bold text-blue-600">報告者: {name}</span>
          <button
            onClick={changeName}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
          >
            名前変更
          </button>
        </div>

        {/* 自分の配車（本人ぶんのみ・閲覧専用） */}
        <button onClick={() => go("/driver/dispatch")} className={`${btn} mb-3 bg-[#0ea5e9]`}>
          🚚 自分の配車を見る
        </button>

        {/* 今日の履歴（トグル） */}
        <button onClick={toggleHist} className={`${btn} bg-[#6c757d]`}>
          {histOpen ? "✖ 履歴を閉じる" : "📊 今日の履歴を確認する"}
        </button>
        {histOpen && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-1">
            {histLoading ? (
              <p className="py-4 text-center text-sm text-slate-400">読み込み中...</p>
            ) : !events || events.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">本日の打刻はまだありません</p>
            ) : (
              <ol>
                {events.map((e, i) => (
                  <li key={e.id} className={`py-3 ${i > 0 ? "border-t border-dashed border-slate-300" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-black text-slate-800">{HIST_LABEL[e.event_type] ?? e.event_type}</span>
                      <span className="text-lg font-black tabular-nums text-slate-700">{hhmm(e.occurred_at)}</span>
                    </div>
                    {e.address && <div className="mt-1 text-sm text-slate-600">📍 {e.address}</div>}
                    {renderDetail(e)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* 報告ボタン群 */}
        <div className="mt-4 flex flex-col gap-3">
          {MENU.map((m) => (
            <button
              key={m.key}
              onClick={() => (m.dialog ? openDialog(m.dialog) : go(m.href!))}
              className={btn}
              style={{ backgroundColor: m.bg }}
            >
              {m.label}
            </button>
          ))}
          {showRest && (
            <button onClick={() => go("/driver/rest")} className={`${btn} bg-[#2196f3]`}>
              ☕ 休憩
            </button>
          )}
        </div>
      </div>

      {/* 報告ダイアログ（出勤/退勤=選択、到着=その場で直接送信） */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDialog}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-teal-300 text-5xl font-bold text-teal-400">
              {arrDone ? "✓" : "?"}
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
              {dialog === "arrival" ? "到着報告" : dialog === "departure" ? "出勤報告" : "退勤報告"}
            </h2>

            {dialog === "arrival" ? (
              arrDone ? (
                <>
                  <p className="mt-2 text-lg font-bold text-green-600">送信しました</p>
                  <button onClick={closeDialog} className="mt-5 rounded-lg bg-slate-900 px-6 py-2.5 font-bold text-white">閉じる</button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-slate-500">送信しますか？</p>
                  <p className="mt-2 text-xs text-slate-400">位置情報: {arrCoords ? "✓ 取得済み" : "取得中…（無くても送信できます）"}</p>
                  {arrErr && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{arrErr}</p>}
                  <div className="mt-5 flex justify-center gap-2">
                    <button onClick={submitArrival} disabled={arrSubmitting} className="rounded-lg bg-indigo-400 px-6 py-2.5 font-bold text-white disabled:opacity-50">
                      {arrSubmitting ? "送信中…" : "送信"}
                    </button>
                    <button onClick={closeDialog} className="rounded-lg bg-slate-500 px-6 py-2.5 font-bold text-white">戻る</button>
                  </div>
                </>
              )
            ) : (
              <>
                <p className="mt-1 text-slate-500">どちらの報告ですか？</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => go(dialog === "departure" ? "/driver/punch/departure" : "/driver/punch/clock_out")}
                    className="rounded-lg bg-blue-500 px-4 py-2.5 font-bold text-white"
                  >
                    {dialog === "departure" ? "通常出勤" : "通常退勤"}
                  </button>
                  <button
                    onClick={() => go(dialog === "departure" ? "/driver/punch/leg_departure" : "/driver/punch/long_rest")}
                    className="rounded-lg bg-amber-400 px-4 py-2.5 font-bold text-white"
                  >
                    {dialog === "departure" ? "長距離再出発" : "長距離休憩"}
                  </button>
                  <button onClick={closeDialog} className="rounded-lg bg-slate-500 px-4 py-2.5 font-bold text-white">戻る</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
