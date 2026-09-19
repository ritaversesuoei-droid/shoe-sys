"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * ドライバーメニュー（現行GAS index画面の忠実再現）。
 *   - 「出勤報告|自分の配車」「退勤報告|日報作成」の2行のみ2カラム、他は全幅（現場要望 2026-09-19）。カード枠・実機の配色/絵文字/文言
 *   - 出勤報告→通常出勤へ直行（長距離再出発は休憩ダイアログへ移設・現場要望 2026-09-19）。
 *   - 休憩は独立した大きなボタン→ダイアログで選択（現場要望 2026-09-19）。
 *       ・勤務中の休憩: 通常休憩（30分目安・押すと即カウント開始）／分割休息（原則3時間・未満終了はアラート＋同意）
 *       ・泊まり（長距離）: 長距離休息（勤務クローズ）→ 長距離再出発（休息あけ・アルコールチェック）
 *       ＝「出勤→休憩→長距離再出発」の流れを1か所に集約。
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
  long_rest: "長距離休息",
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

// 実機の配色（スクショ準拠）。2カラムにするのは「出勤報告|自分の配車」「退勤報告|日報作成」の2行だけ。
//   それ以外（到着/積込/荷卸/休憩）は全幅（現場要望 2026-09-19）。
const MENU: {
  key: string;
  label: string;
  bg: string;
  dialog?: "arrival" | "rest";
  href?: string;
  sub?: string; // ボタン下の補足文言（中身が分かりにくいボタン用）
}[] = [
  { key: "departure", label: "☀️ 出勤報告", bg: "#4285f4", href: "/driver/punch/departure" },
  { key: "dispatch", label: "🚚 自分の配車", bg: "#0ea5e9", href: "/driver/dispatch" },
  { key: "arrival", label: "📍 到着報告", bg: "#4caf50", dialog: "arrival" },
  { key: "loading", label: "📦 積込完了", bg: "#3d9aa5", href: "/driver/punch/loading" },
  { key: "unloading", label: "🏭 荷卸完了", bg: "#6320ee", href: "/driver/punch/unloading" },
  // 休憩の中に長距離再出発/長距離休息があると気づけるよう補足を表示（現場要望 2026-09-19）
  { key: "rest", label: "☕ 休憩・長距離", sub: "長距離再出発・長距離休息もこちら", bg: "#2196f3", dialog: "rest" },
  { key: "fuel", label: "⛽ 給油記録", bg: "#0f766e", href: "/driver/fuel" },
  { key: "clock_out", label: "🌙 退勤報告", bg: "#d9534f", href: "/driver/punch/clock_out" },
  { key: "report", label: "📝 日報作成", bg: "#455a64", href: "/driver/report" },
];

export function DriverMenu({ name }: { name: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "arrival" | "rest">(null);
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

  function openDialog(d: "arrival" | "rest") {
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
  // 2カラム（半幅）用は文字をやや小さめ＋leading-tight。高さ(py-5)は全幅と同じ。
  const gridBtn = "w-full rounded-2xl py-5 text-center text-lg font-bold leading-tight text-white shadow-md active:translate-y-[1px]";
  const item = (k: string) => MENU.find((m) => m.key === k)!;
  const renderBtn = (m: (typeof MENU)[number], cls: string) => (
    <button
      key={m.key}
      onClick={() => (m.dialog ? openDialog(m.dialog) : go(m.href!))}
      className={cls}
      style={{ backgroundColor: m.bg }}
    >
      {m.sub ? (
        <span className="flex flex-col items-center leading-tight">
          <span>{m.label}</span>
          <span className="mt-1 text-xs font-semibold text-white/90">{m.sub}</span>
        </span>
      ) : (
        m.label
      )}
    </button>
  );

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

        {/* 報告ボタン群。2カラムにするのは「出勤報告|自分の配車」「退勤報告|日報作成」だけ。他は全幅。 */}
        <div className="mt-4 flex flex-col gap-3">
          {/* 出勤報告 | 自分の配車（2カラム） */}
          <div className="grid grid-cols-2 gap-3">
            {renderBtn(item("departure"), gridBtn)}
            {renderBtn(item("dispatch"), gridBtn)}
          </div>
          {/* 中段は全幅 */}
          {renderBtn(item("arrival"), btn)}
          {renderBtn(item("loading"), btn)}
          {renderBtn(item("unloading"), btn)}
          {renderBtn(item("rest"), btn)}
          {renderBtn(item("fuel"), btn)}
          {/* 退勤報告 | 日報作成（2カラム） */}
          <div className="grid grid-cols-2 gap-3">
            {renderBtn(item("clock_out"), gridBtn)}
            {renderBtn(item("report"), gridBtn)}
          </div>
        </div>
      </div>

      {/* 報告ダイアログ（休憩=通常休憩/分割休息/長距離休息/長距離再出発、到着=その場で直接送信。出勤は通常出勤へ直行） */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDialog}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-teal-300 text-5xl font-bold text-teal-400">
              {arrDone ? "✓" : "?"}
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
              {dialog === "arrival" ? "到着報告" : "休憩・長距離"}
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
                <p className="mt-1 text-slate-500">休憩の種類を選んでください</p>
                <div className="mt-5 flex flex-col gap-2 text-left">
                  {/* ── 勤務中の休憩 ── */}
                  <p className="px-1 text-xs font-bold text-slate-400">勤務中の休憩</p>
                  {/* 通常休憩=勤務中の休憩タイマー。押すと即カウント開始（/driver/rest で自動開始） */}
                  <button
                    onClick={() => go("/driver/rest")}
                    className="rounded-xl bg-blue-500 px-4 py-3 active:translate-y-[1px]"
                  >
                    <span className="block text-lg font-bold text-white">☕ 通常休憩</span>
                    <span className="mt-0.5 block text-xs text-blue-50">押すとその場でカウント開始（30分タイマー）。勤務は続きます。</span>
                  </button>
                  {/* 分割休息=通常休憩の仕組みで実行。原則3時間、3時間未満で終了する時はアラート＋同意 */}
                  <button
                    onClick={() => go("/driver/rest?mode=split")}
                    className="rounded-xl bg-indigo-500 px-4 py-3 active:translate-y-[1px]"
                  >
                    <span className="block text-lg font-bold text-white">🛌 分割休息（3時間以上）</span>
                    <span className="mt-0.5 block text-xs text-indigo-50">押すとその場でカウント開始。原則3時間・未満で終了する時は同意が必要です。</span>
                  </button>

                  {/* ── 泊まり（長距離）：休息に入る → 再出発。出勤→休憩→長距離再出発の流れ ── */}
                  <p className="mt-2 px-1 text-xs font-bold text-slate-400">泊まり（長距離）</p>
                  {/* 長距離休息=泊まりの休息。勤務を一旦終了 */}
                  <button
                    onClick={() => go("/driver/punch/long_rest")}
                    className="rounded-xl bg-amber-500 px-4 py-3 active:translate-y-[1px]"
                  >
                    <span className="block text-lg font-bold text-white">🌙 長距離休息（泊まりに入る）</span>
                    <span className="mt-0.5 block text-xs text-amber-50">泊まりの休息に入ります（勤務を一旦終了）。</span>
                  </button>
                  {/* 長距離再出発=休息あけの運転再開。アルコールチェック（写真）が必要。出勤ダイアログから移設 */}
                  <button
                    onClick={() => go("/driver/punch/leg_departure")}
                    className="rounded-xl bg-orange-600 px-4 py-3 active:translate-y-[1px]"
                  >
                    <span className="block text-lg font-bold text-white">🚚 長距離再出発（休息あけ）</span>
                    <span className="mt-0.5 block text-xs text-orange-50">休息を終えて運転を再開します。アルコールチェック（撮影）が必要です。</span>
                  </button>

                  <button onClick={closeDialog} className="mt-1 rounded-lg bg-slate-500 px-4 py-2.5 text-center font-bold text-white">戻る</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
