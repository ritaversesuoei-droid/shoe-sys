"use client";

import { useState } from "react";

/**
 * 出勤アラート設定（設定画面）。出勤指示時間より「何分前」からアラート＋同意を出すか（猶予）。
 *   保存先: app_settings('attendance').early_departure_grace_min（既定0）。
 */
export function AttendanceSettings({ initialGraceMin }: { initialGraceMin: number }) {
  const [grace, setGrace] = useState<string>(String(initialGraceMin));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const n = Number(grace);
      if (!Number.isFinite(n) || n < 0 || n > 1440) throw new Error("0〜1440 の分数で入力してください");
      const res = await fetch("/api/admin/settings/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { early_departure_grace_min: Math.round(n) }, description: "出勤アラート（早出）設定" }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setMsg("保存しました");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-800">出勤アラート（早出）</h2>
      <p className="mt-1 text-sm text-slate-500">
        出勤指示時間より早い出勤で、ドライバーの打刻画面にアラート＋同意チェックを出します（同意しないと出勤ボタンを押せません）。
        指示時間は「配車表」画面で日別・ドライバー別に設定します。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm font-bold text-slate-700">指示時間の</label>
        <input
          type="number"
          min={0}
          max={1440}
          value={grace}
          onChange={(e) => setGrace(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
        <span className="text-sm font-bold text-slate-700">分以上前からアラート（0＝指示時間より前なら即）</span>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        {msg && <span className="text-sm font-bold text-green-600">{msg}</span>}
        {err && <span className="text-sm font-bold text-red-600">{err}</span>}
      </div>
    </section>
  );
}
