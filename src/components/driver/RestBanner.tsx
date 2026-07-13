"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * ドライバーメニュー上部の「休憩中」バナー（② 見忘れ防止の強化）。
 * RestTimer が localStorage に保存した休憩状態を読み、休憩中のみ開始時刻・経過を常時表示。
 */
const STORAGE_KEY = "shoei_rest_active";
const TARGET_MS = 30 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function jstHHMM(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function RestBanner() {
  const [start, setStart] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStart((JSON.parse(raw) as { startISO?: string }).startISO ?? null);
    } catch {
      /* 破損データは無視 */
    }
  }, []);

  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);

  if (!start) return null;
  const elapsed = Math.max(0, now - Date.parse(start));
  const reached = elapsed >= TARGET_MS;

  return (
    <Link
      href="/driver/rest"
      className={`mb-3 flex items-center justify-between rounded-xl border px-4 py-3 active:scale-[0.99] ${
        reached ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"
      }`}
    >
      <span className="font-bold">☕ 休憩中</span>
      <span className="text-sm tabular-nums text-slate-700">
        {jstHHMM(start)}開始 ・ 経過 {mmss(elapsed)}
        {reached ? " ✓30分" : ""}
      </span>
    </Link>
  );
}
