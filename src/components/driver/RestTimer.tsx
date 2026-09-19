"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * ② 通常休憩／分割休息（S-02系 / 現場要望）。
 *   - 休憩ボタン→この画面に来た時点で自動でカウント開始（rest_start）。別途「開始」ボタンは持たない。
 *   - mode="normal": 30分目安タイマー（連続運転の中断目安）。
 *   - mode="split" : 分割休息＝原則3時間以上。3時間未満で終了しようとすると
 *       アラート＋同意チェックを入れないと終了できない（現場要望 2026-09-19）。
 *   - 休憩開始/終了で位置情報を送信（events: rest_start / rest_end。分割休息は note に記録）
 *   - 状態は localStorage に保持し、画面遷移・再読込・端末スリープをまたいでも復元
 *
 * 30分 = 改善基準告示の「連続運転4時間ごと・おおむね30分以上の休憩」の目安。
 * 3時間 = 分割休息特例の1回あたり下限（各3時間以上）。集計反映は別途・社労士確認後。
 */

type RestMode = "normal" | "split";

const STORAGE_KEY = "shoei_rest_active";
const NORMAL_TARGET_MS = 30 * 60 * 1000; // 通常休憩 30分の目安
const SPLIT_TARGET_MS = 3 * 60 * 60 * 1000; // 分割休息 原則3時間

interface ActiveRest {
  startISO: string;
  vehicleNo?: string;
  mode?: RestMode; // 既定は normal
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** JST の HH:MM */
function jstHHMM(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** JST の YYYY-MM-DD（日跨ぎ検出用） */
function jstDateKey(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** 経過を mm:ss（1時間以上は H:MM:SS）で。分割休息=3時間も見やすく。 */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

async function getCoords(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export function RestTimer({ mode = "normal" }: { mode?: RestMode }) {
  const [active, setActive] = useState<ActiveRest | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ startISO: string; endISO: string; mode: RestMode } | null>(null);
  const [endAck, setEndAck] = useState(false); // 分割休息を3時間未満で終了する同意
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 冪等キーは開始/終了それぞれに固定（毎回 randomUUID だと二度押し・失敗リトライで
  //   別キーになり休憩が重複記録される）。成功時のみ新キーへ更新、失敗時は同一キーで再送。
  const busyRef = useRef(false);
  const startKeyRef = useRef<string | null>(null);
  const endKeyRef = useRef<string | null>(null);
  const autoStartedRef = useRef(false); // 自動開始は一度だけ（失敗時の無限リトライ防止）

  // 復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setActive(JSON.parse(raw) as ActiveRest);
    } catch {
      /* 破損データは無視 */
    }
  }, []);

  // ライブ更新（休憩中のみ 1秒ごと）
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  const startRest = useCallback(async () => {
    if (busyRef.current) return; // 二度押しは即return
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (startKeyRef.current === null) startKeyRef.current = crypto.randomUUID();
      const startISO = new Date().toISOString();
      const vehicleNo = localStorage.getItem("shoei_vehicle_no") ?? undefined;
      const { lat, lng } = await getCoords();
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: startKeyRef.current,
          event_type: "rest_start",
          occurred_at: startISO,
          vehicle_no: vehicleNo,
          lat,
          lng,
          // 分割休息は種別を note に記録（管理側の履歴で判別可能に）
          note: mode === "split" ? "分割休息" : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "休憩開始の記録に失敗しました");
      const a: ActiveRest = { startISO, vehicleNo, mode };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
      setDone(null);
      setEndAck(false);
      setActive(a);
      startKeyRef.current = crypto.randomUUID(); // 次の休憩開始用
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [mode]);

  const endRest = useCallback(async () => {
    if (!active) return;
    if (busyRef.current) return; // 二度押しは即return
    const activeMode: RestMode = active.mode ?? "normal";
    const endMs = Date.now();
    const early = activeMode === "split" && endMs - Date.parse(active.startISO) < SPLIT_TARGET_MS;
    // 分割休息は原則3時間。3時間未満の終了は同意チェックが無い限り実行しない。
    if (early && !endAck) {
      setError("分割休息は原則3時間以上です。3時間未満で終了する場合は同意にチェックしてください");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (endKeyRef.current === null) endKeyRef.current = crypto.randomUUID();
      const endISO = new Date().toISOString();
      const { lat, lng } = await getCoords();
      const note =
        activeMode === "split"
          ? early
            ? "分割休息（3時間未満で終了・承知の上）"
            : "分割休息"
          : undefined;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: endKeyRef.current,
          event_type: "rest_end",
          occurred_at: endISO,
          vehicle_no: active.vehicleNo,
          lat,
          lng,
          note,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "休憩終了の記録に失敗しました");
      localStorage.removeItem(STORAGE_KEY);
      setDone({ startISO: active.startISO, endISO, mode: activeMode });
      setActive(null);
      setEndAck(false);
      endKeyRef.current = crypto.randomUUID(); // 次の休憩終了用
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [active, endAck]);

  const discard = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActive(null);
    setError(null);
  }, []);

  // このページの目的は休憩開始。到着時に休憩中でなければ自動でカウント開始（現場要望: 押したら即カウント）。
  //   休憩ボタン(通常休憩)→/driver/rest 遷移だけで開始でき、別の「開始」ボタンは不要にする。
  useEffect(() => {
    if (autoStartedRef.current) return;
    let hasActive = false;
    try {
      hasActive = !!localStorage.getItem(STORAGE_KEY);
    } catch {
      /* 参照不可は未開始扱い */
    }
    if (!hasActive && !done && !busyRef.current) {
      autoStartedRef.current = true;
      void startRest();
    }
  }, [done, startRest]);

  // ---- 休憩終了後のサマリ ----
  if (done) {
    const total = Date.parse(done.endISO) - Date.parse(done.startISO);
    const isSplit = done.mode === "split";
    const targetMs = isSplit ? SPLIT_TARGET_MS : NORMAL_TARGET_MS;
    const targetLabel = isSplit ? "3時間" : "30分";
    const enough = total >= targetMs;
    return (
      <main className="mx-auto max-w-md p-4">
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <div className="text-2xl">✓</div>
          <h1 className="mt-2 text-lg font-bold">{isSplit ? "分割休息を終了しました" : "休憩を終了しました"}</h1>
          <div className="mt-3 text-sm text-slate-700">
            {jstHHMM(done.startISO)} 〜 {jstHHMM(done.endISO)}
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{clock(total)}</div>
          <p className={`mt-2 text-sm ${enough ? "text-green-700" : "text-amber-700"}`}>
            {enough ? `${targetLabel}以上とれました` : `※ ${targetLabel}に達していません`}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => {
              autoStartedRef.current = false; // 再度の自動開始を許可
              setEndAck(false);
              setDone(null);
            }}
            className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium"
          >
            もう一度 {isSplit ? "休息" : "休憩"}する
          </button>
          <Link
            href="/driver"
            className="rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
          >
            メニューへ戻る
          </Link>
        </div>
      </main>
    );
  }

  // ---- 休憩中／分割休息中（タイマー表示）----
  if (active) {
    const activeMode: RestMode = active.mode ?? "normal";
    const isSplit = activeMode === "split";
    const targetMs = isSplit ? SPLIT_TARGET_MS : NORMAL_TARGET_MS;
    const targetLabel = isSplit ? "3時間" : "30分";
    const elapsed = Math.max(0, now - Date.parse(active.startISO));
    const reached = elapsed >= targetMs;
    const remain = Math.max(0, targetMs - elapsed);
    const pct = Math.min(100, (elapsed / targetMs) * 100);
    const early = isSplit && !reached; // 分割休息を3時間未満で終了しようとしている
    const stale = jstDateKey(Date.parse(active.startISO)) !== jstDateKey(now);
    const tone = reached
      ? { bg: "bg-green-50", border: "border-green-300", bar: "bg-green-500", text: "text-green-700" }
      : { bg: "bg-amber-50", border: "border-amber-300", bar: "bg-amber-500", text: "text-amber-700" };

    return (
      <main className="mx-auto max-w-md p-4">
        <header className="mb-4 flex items-center gap-2">
          <Link href="/driver" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600 active:scale-95">← 戻る</Link>
          <h1 className="text-xl font-bold">{isSplit ? "分割休息中" : "休憩中"}</h1>
          {isSplit && <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">原則3時間以上</span>}
        </header>

        {stale && (
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
            前日からの{isSplit ? "休息" : "休憩"}が残っています。誤りなら「破棄」してください。
          </p>
        )}

        <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-6 text-center`}>
          <div className="text-sm text-slate-500">開始時刻</div>
          <div className="text-4xl font-extrabold tabular-nums">{jstHHMM(active.startISO)}</div>

          <div className="mt-5 text-sm text-slate-500">経過時間</div>
          <div className="text-5xl font-extrabold tabular-nums">{clock(elapsed)}</div>

          {/* 目安タイマーの進捗（通常30分／分割休息3時間） */}
          <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-white/70">
            <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-2 text-sm font-medium ${tone.text}`}>
            {reached ? `✓ ${targetLabel}以上とれました` : `${targetLabel}まで あと ${clock(remain)}`}
          </p>
        </div>

        {/* 分割休息を3時間未満で終了する場合の同意ゲート */}
        {early && (
          <div className="mt-4 rounded-2xl border-2 border-red-400 bg-red-50 p-4">
            <p className="text-center text-base font-black text-red-700">⚠ まだ3時間に達していません</p>
            <p className="mt-1 text-xs text-red-700">分割休息は原則3時間以上です。やむを得ず3時間未満で終了する場合は、下記に同意してください。</p>
            <label className="mt-3 flex items-start gap-3 rounded-xl border-2 border-red-300 bg-white p-3 active:scale-[0.99]">
              <input
                type="checkbox"
                checked={endAck}
                onChange={(e) => setEndAck(e.target.checked)}
                className="mt-0.5 h-6 w-6 flex-none accent-red-600"
              />
              <span className="text-sm font-bold text-slate-800">3時間未満で終了することを承知します</span>
            </label>
          </div>
        )}

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={endRest}
          disabled={busy || (early && !endAck)}
          className="mt-6 w-full rounded-2xl bg-orange-600 px-4 py-5 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "記録中..." : early && !endAck ? "同意にチェックしてください" : isSplit ? "🌙 分割休息を終了する" : "🌙 休憩を終了する"}
        </button>
        {stale && (
          <button onClick={discard} className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-500">
            この{isSplit ? "休息" : "休憩"}を破棄
          </button>
        )}
      </main>
    );
  }

  // ---- 開始前（通常は自動でカウント開始するため一瞬のみ。失敗時だけ再試行を表示）----
  const startLabel = mode === "split" ? "分割休息" : "休憩";
  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600 active:scale-95">← 戻る</Link>
        <h1 className="text-xl font-bold">{startLabel}</h1>
      </header>

      {error ? (
        <>
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
          <button
            onClick={startRest}
            disabled={busy}
            className="w-full rounded-2xl bg-blue-600 px-4 py-8 text-2xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? "記録中..." : `☕ ${startLabel}を開始する（再試行）`}
          </button>
        </>
      ) : (
        <p className="mt-10 text-center text-lg font-bold text-slate-500">☕ {startLabel}のカウントを開始しています…</p>
      )}
    </main>
  );
}
