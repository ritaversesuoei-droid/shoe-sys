"use client";

import { useEffect, useState } from "react";

/**
 * 盤面の表示サイズ（大/標準/小）を端末ごとに切り替える。
 *   CSS zoom で盤面全体を拡大縮小しつつ、width を 1/zoom% にして「余白を作らず画面いっぱい」に
 *   保つ（小さくすると一画面に多く、大きくすると読みやすく）。zoom はレイアウトに効くため
 *   （transform と違い）内部の overflow-x スクロールもそのまま機能する。Edge/Chrome/Safari 対応。
 *   ブラウザ/OS のズーム設定とは独立に、この画面だけで調整できる。
 */
const LEVELS = [
  { key: "sm", label: "小", zoom: 0.8 },
  { key: "md", label: "標準", zoom: 1 },
  { key: "lg", label: "大", zoom: 1.18 },
] as const;
type LevelKey = (typeof LEVELS)[number]["key"];

export function useBoardZoom(storageKey: string): { control: React.ReactNode; wrapStyle: React.CSSProperties } {
  const skey = `shoei_board_zoom_${storageKey}`;
  const [level, setLevel] = useState<LevelKey>("md");

  useEffect(() => {
    try {
      const v = localStorage.getItem(skey);
      if (v === "sm" || v === "md" || v === "lg") setLevel(v);
    } catch {
      /* localStorage 不可でも標準で動作 */
    }
  }, [skey]);

  function choose(l: LevelKey) {
    setLevel(l);
    try {
      localStorage.setItem(skey, l);
    } catch {
      /* 保存不可でも今回のセッションでは反映 */
    }
  }

  const zoom = LEVELS.find((l) => l.key === level)?.zoom ?? 1;
  // zoom を width で相殺し、縮小時も画面いっぱいに（余白を作らない）
  const wrapStyle: React.CSSProperties = { zoom, width: `${Math.round((100 / zoom) * 100) / 100}%` };

  const control = (
    <span className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5 no-print" title="この画面の表示サイズ（端末ごとに記憶）">
      <span className="px-1 text-[10px] font-bold text-slate-400">表示</span>
      {LEVELS.map((l) => (
        <button
          key={l.key}
          type="button"
          onClick={() => choose(l.key)}
          className={`rounded px-2 py-0.5 text-xs font-bold ${level === l.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {l.label}
        </button>
      ))}
    </span>
  );

  return { control, wrapStyle };
}
