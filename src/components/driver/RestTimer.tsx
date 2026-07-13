"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * ② 休憩ボタン（S-02系 / 現場要望）。
 *   - 休憩開始/終了で位置情報を送信（events: rest_start / rest_end）
 *   - スマホ上に「開始時刻」と「30分ライブタイマー」を表示（何時から休んだか見忘れ防止）
 *   - 状態は localStorage に保持し、画面遷移・再読込・端末スリープをまたいでも復元
 *
 * 30分 = 改善基準告示の「連続運転4時間ごと・おおむね30分以上の休憩」の目安表示。
 * （労働/拘束の再計算・連続運転リセット等の集計反映は別途・社労士確認後）
 */

const STORAGE_KEY = "shoei_rest_active";
const TARGET_MS = 30 * 60 * 1000; // 30分の目安

interface ActiveRest {
  startISO: string;
  vehicleNo?: string;
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
/** 経過を mm:ss で */
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
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

export function RestTimer() {
  const [active, setActive] = useState<ActiveRest | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ startISO: string; endISO: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setBusy(true);
    setError(null);
    try {
      const startISO = new Date().toISOString();
      const vehicleNo = localStorage.getItem("shoei_vehicle_no") ?? undefined;
      const { lat, lng } = await getCoords();
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          event_type: "rest_start",
          occurred_at: startISO,
          vehicle_no: vehicleNo,
          lat,
          lng,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "休憩開始の記録に失敗しました");
      const a: ActiveRest = { startISO, vehicleNo };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
      setDone(null);
      setActive(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const endRest = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const endISO = new Date().toISOString();
      const { lat, lng } = await getCoords();
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          event_type: "rest_end",
          occurred_at: endISO,
          vehicle_no: active.vehicleNo,
          lat,
          lng,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "休憩終了の記録に失敗しました");
      localStorage.removeItem(STORAGE_KEY);
      setDone({ startISO: active.startISO, endISO });
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [active]);

  const discard = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActive(null);
    setError(null);
  }, []);

  // ---- 休憩終了後のサマリ ----
  if (done) {
    const total = Date.parse(done.endISO) - Date.parse(done.startISO);
    const enough = total >= TARGET_MS;
    return (
      <main className="mx-auto max-w-md p-4">
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <div className="text-2xl">✓</div>
          <h1 className="mt-2 text-lg font-bold">休憩を終了しました</h1>
          <div className="mt-3 text-sm text-slate-700">
            {jstHHMM(done.startISO)} 〜 {jstHHMM(done.endISO)}
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{mmss(total)}</div>
          <p className={`mt-2 text-sm ${enough ? "text-green-700" : "text-amber-700"}`}>
            {enough ? "30分以上の休憩がとれました" : "※ 30分に達していません"}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => setDone(null)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium"
          >
            もう一度 休憩する
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

  // ---- 休憩中（タイマー表示）----
  if (active) {
    const elapsed = Math.max(0, now - Date.parse(active.startISO));
    const reached = elapsed >= TARGET_MS;
    const remain = Math.max(0, TARGET_MS - elapsed);
    const pct = Math.min(100, (elapsed / TARGET_MS) * 100);
    const stale = jstDateKey(Date.parse(active.startISO)) !== jstDateKey(now);
    const tone = reached
      ? { bg: "bg-green-50", border: "border-green-300", bar: "bg-green-500", text: "text-green-700" }
      : { bg: "bg-amber-50", border: "border-amber-300", bar: "bg-amber-500", text: "text-amber-700" };

    return (
      <main className="mx-auto max-w-md p-4">
        <header className="mb-4 flex items-center gap-2">
          <Link href="/driver" className="text-slate-400">←</Link>
          <h1 className="text-xl font-bold">休憩中</h1>
        </header>

        {stale && (
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
            前日からの休憩が残っています。誤りなら「破棄」してください。
          </p>
        )}

        <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-6 text-center`}>
          <div className="text-sm text-slate-500">開始時刻</div>
          <div className="text-4xl font-extrabold tabular-nums">{jstHHMM(active.startISO)}</div>

          <div className="mt-5 text-sm text-slate-500">経過時間</div>
          <div className="text-5xl font-extrabold tabular-nums">{mmss(elapsed)}</div>

          {/* 30分タイマーの進捗 */}
          <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-white/70">
            <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-2 text-sm font-medium ${tone.text}`}>
            {reached ? "✓ 30分の休憩がとれました" : `30分まで あと ${mmss(remain)}`}
          </p>
        </div>

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={endRest}
          disabled={busy}
          className="mt-6 w-full rounded-2xl bg-orange-600 px-4 py-5 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "記録中..." : "🌙 休憩を終了する"}
        </button>
        {stale && (
          <button onClick={discard} className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-500">
            この休憩を破棄
          </button>
        )}
      </main>
    );
  }

  // ---- 休憩開始前 ----
  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="text-slate-400">←</Link>
        <h1 className="text-xl font-bold">休憩</h1>
      </header>

      <p className="mb-6 text-sm text-slate-500">
        ボタンを押すと現在地とともに休憩開始を記録します。開始時刻と30分タイマーを表示します。
      </p>

      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={startRest}
        disabled={busy}
        className="w-full rounded-2xl bg-blue-600 px-4 py-8 text-2xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "記録中..." : "☕ 休憩を開始する"}
      </button>
    </main>
  );
}
