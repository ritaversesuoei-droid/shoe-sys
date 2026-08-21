"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 管理画面 共通ナビ（アイコン＋色・大きめタップ領域）。ログイン画面では非表示。 */
const ITEMS: { href: string; icon: string; label: string; color: string }[] = [
  { href: "/admin", icon: "🏠", label: "ホーム", color: "bg-slate-100 text-slate-700" },
  { href: "/admin/tim", icon: "📡", label: "T・I・M", color: "bg-yellow-100 text-yellow-800" },
  { href: "/admin/attendance", icon: "⏱️", label: "勤怠修正", color: "bg-amber-100 text-amber-800" },
  { href: "/admin/dispatch", icon: "🚚", label: "配車表", color: "bg-sky-100 text-sky-800" },
  { href: "/admin/logiflow", icon: "🗺️", label: "流れ表", color: "bg-cyan-100 text-cyan-800" },
  { href: "/admin/reports", icon: "📄", label: "日報", color: "bg-emerald-100 text-emerald-800" },
  { href: "/admin/photos", icon: "📷", label: "写真", color: "bg-fuchsia-100 text-fuchsia-800" },
  { href: "/admin/monthly", icon: "📊", label: "月次集計", color: "bg-indigo-100 text-indigo-800" },
  { href: "/admin/warnings", icon: "⚠️", label: "警告", color: "bg-rose-100 text-rose-800" },
  { href: "/admin/masters", icon: "🗂️", label: "マスタ", color: "bg-teal-100 text-teal-800" },
  { href: "/admin/settings", icon: "⚙️", label: "設定", color: "bg-slate-100 text-slate-700" },
];

export default function AdminNav() {
  const path = usePathname();
  if (!path || path.startsWith("/admin/login")) return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      {/* スマホ: 横スクロール1行（コンパクト）／PC: 折返しグリッド（大きめ） */}
      <div className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto p-1.5 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:p-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {ITEMS.map((it) => {
          const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex min-w-[3.6rem] shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center text-[11px] font-bold leading-tight transition sm:min-w-[4.5rem] sm:flex-1 sm:shrink sm:gap-1 sm:rounded-2xl sm:py-3 sm:text-sm ${
                active ? "bg-slate-900 text-white shadow" : `${it.color} hover:brightness-95`
              }`}
            >
              <span className="text-xl leading-none sm:text-3xl">{it.icon}</span>
              <span className="whitespace-nowrap">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
