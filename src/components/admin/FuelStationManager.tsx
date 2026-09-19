"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FuelStation } from "@/lib/operations/fuel";

/**
 * 給油所マスタ（給油区分）。ドライバーの給油記録フォームに出る選択肢を増減する。
 *   - 「満タン固定」＝その給油所は常に満タン給油（例: トラック組合）。ドライバー画面で満タンON＋ロックになる。
 *   - 保存先: app_settings('fuel_stations').list（マイグレーション不要）。
 */
export function FuelStationManager({ initial }: { initial: FuelStation[] }) {
  const router = useRouter();
  const [list, setList] = useState<FuelStation[]>(initial);
  const [newName, setNewName] = useState("");
  const [newForceFull, setNewForceFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const name = newName.trim();
    if (!name) return;
    if (list.some((s) => s.name === name)) {
      setErr("同じ名称の給油所が既にあります");
      return;
    }
    setList((l) => [...l, { name, forceFull: newForceFull }]);
    setNewName("");
    setNewForceFull(false);
    setErr(null);
  }
  function remove(name: string) {
    setList((l) => l.filter((s) => s.name !== name));
  }
  function toggleForce(name: string) {
    setList((l) => l.map((s) => (s.name === name ? { ...s, forceFull: !s.forceFull } : s)));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (list.length === 0) throw new Error("給油所を1つ以上登録してください");
      const res = await fetch("/api/admin/settings/fuel_stations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { list }, description: "給油所マスタ（給油区分）" }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setMsg("保存しました");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-800">⛽ 給油所マスタ（給油区分）</h2>
      <p className="mt-1 text-sm text-slate-500">
        ドライバーの給油記録フォームに出る「給油区分」の選択肢です。増減できます。<br />
        「満タン固定」にすると、その給油所を選んだ時は自動で満タン給油になります（例: トラック組合）。
      </p>

      <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {list.length === 0 ? (
          <li className="p-3 text-sm text-slate-400">給油所が登録されていません</li>
        ) : (
          list.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 p-3">
              <span className="font-bold text-slate-800">{s.name}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-sm text-slate-600">
                  <input type="checkbox" checked={s.forceFull} onChange={() => toggleForce(s.name)} className="h-4 w-4" />
                  満タン固定
                </label>
                <button onClick={() => remove(s.name)} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
                  × 削除
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="給油所名（例: ○○石油）"
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={newForceFull} onChange={(e) => setNewForceFull(e.target.checked)} className="h-4 w-4" />
          満タン固定
        </label>
        <button onClick={add} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">＋ 追加</button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "保存中…" : "保存"}
        </button>
        {msg && <span className="text-sm font-bold text-green-600">{msg}</span>}
        {err && <span className="text-sm font-bold text-red-600">{err}</span>}
        <span className="ml-auto text-xs text-slate-400">「追加/削除」後は「保存」で確定します</span>
      </div>
    </section>
  );
}
