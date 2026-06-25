"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 管理画面 共通ナビ（アイコン＋色・大きめタップ領域）。ログイン画面では非表示。 */
const ITEMS: { href: string; icon: string; label: string; color: string }[] = [
  { href: "/admin", icon: "🏠", label: "ホーム", color: "bg-slate-100 text-slate-700" },
  { href: "/admin/attendance", icon: "⏱️", label: "勤怠修正", color: "bg-amber-100 text-amber-800" },
  { href: "/admin/dispatch", icon: "🚚", label: "配車表", color: "bg-sky-100 text-sky-800" },
  { href: "/admin/reports", icon: "📄", label: "日報", color: "bg-emerald-100 text-emerald-800" },
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
      <div className="mx-auto flex max-w-7xl flex-wrap gap-2 p-2">
        {ITEMS.map((it) => {
          const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center text-sm font-bold transition ${
                active ? "bg-slate-900 text-white shadow" : `${it.color} hover:brightness-95`
              }`}
            >
              <span className="text-3xl leading-none">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
