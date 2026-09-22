"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 配車表の「荷主の表示順」設定パネル（/admin/dispatch）。
 *   配車表は荷主ごとにまとめて表示し、この順（上から）で並べる。未指定の荷主は後ろ（名前順）。
 *   保存先は app_settings('dispatch_shipper_order')＝一度決めれば記憶される。
 */
export function ShipperOrderPanel({
  initialOrder,
  shippers,
}: {
  initialOrder: string[];
  shippers: { name: string; count: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState((initialOrder.length ? initialOrder : shippers.map((s) => s.name)).join("\n"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // まだ並び順に入っていない荷主（クリックで末尾に追加）
  const listed = new Set(text.split("\n").map((l) => l.trim()).filter(Boolean));
  const unlisted = shippers.filter((s) => !listed.has(s.name));

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const value = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const res = await fetch("/api/admin/settings/dispatch_shipper_order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, description: "配車表の荷主表示順（上から）" }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setMsg("保存しました。並び順を反映します。");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 print:hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="text-base font-bold text-teal-800">🗂️ 荷主の表示順（配車表を荷主ごとにまとめて並べる）</span>
        <span className="text-sm text-teal-600">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="border-t border-teal-200 px-4 py-3">
          <p className="mb-2 text-xs text-slate-500">
            1行に1つ、上から表示したい順に荷主名を並べてください（ここに無い荷主は自動で後ろ＝名前順）。一度保存すれば記憶されます。
          </p>
          {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
          {msg && <p className="mb-2 rounded bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">表示順（上から）</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-slate-300 p-2 font-mono text-sm"
                placeholder={"川一産業 名古屋\nJ物 電磁\nJ物中部"}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">未登録の荷主（クリックで末尾に追加）</label>
              <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {unlisted.length === 0 ? (
                  <span className="text-xs text-slate-400">すべて登録済みです</span>
                ) : (
                  unlisted.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setText((t) => (t.trim() ? `${t.replace(/\n+$/, "")}\n${s.name}` : s.name))}
                      className="rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700 hover:bg-teal-100"
                    >
                      {s.name}<span className="ml-1 text-teal-400">{s.count}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={save} disabled={busy} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-black text-white shadow disabled:opacity-50">
              {busy ? "保存中…" : "保存して反映"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
