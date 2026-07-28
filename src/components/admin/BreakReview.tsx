"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BreakRow {
  shiftId: string;
  workDate: string;
  driverName: string;
  driverCode: string | null;
  laborMin: number;
  restMin: number;
  requiredRestMin: number;
  restFlag: "short" | "over";
}

const hm = (m: number): string => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

/** 月次トータルから休憩不足/過多を一覧し、その場で休憩(分)を修正→再計算する。 */
export function BreakReview({ rows }: { rows: BreakRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  async function save(shiftId: string, fallback: number) {
    const val = edits[shiftId] ?? fallback;
    setSaving(shiftId);
    setErr(null);
    setDoneId(null);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rest_min: val }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setDoneId(shiftId);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
        休憩の要確認はありません（不足・過多なし）。
      </p>
    );
  }

  return (
    <div>
      {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="p-2 whitespace-nowrap">日付 / ドライバー</th>
              <th className="p-2 text-right whitespace-nowrap">労働</th>
              <th className="p-2 whitespace-nowrap">判定</th>
              <th className="p-2 whitespace-nowrap">休憩(分)を修正</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = edits[r.shiftId] ?? r.restMin;
              return (
                <tr key={r.shiftId} className={`border-t ${r.restFlag === "short" ? "bg-rose-50" : "bg-amber-50"}`}>
                  <td className="p-2 whitespace-nowrap">
                    <span className="font-bold">{r.workDate.slice(5)}</span>
                    <span className="ml-2">{r.driverName}</span>
                    {r.driverCode && <span className="ml-1 text-xs text-slate-400">{r.driverCode}</span>}
                  </td>
                  <td className="p-2 text-right font-mono">{hm(r.laborMin)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {r.restFlag === "short" ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                        休憩不足（必要 {r.requiredRestMin}分 / 現在 {r.restMin}分）
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                        休憩過多（{r.restMin}分）
                      </span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={5}
                      value={cur}
                      onChange={(e) => setEdits((p) => ({ ...p, [r.shiftId]: Number(e.target.value) }))}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
                    />
                    <span className="ml-1 text-xs text-slate-500">分</span>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <button
                      onClick={() => save(r.shiftId, r.restMin)}
                      disabled={saving === r.shiftId}
                      className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {saving === r.shiftId ? "保存中…" : doneId === r.shiftId ? "✓ 保存" : "保存して再計算"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        休憩を保存すると拘束/労働/深夜と改善基準の判定が自動で再計算されます。
        必要休憩=労基法34条（労働6h超45分・8h超60分）／過多=4時間超。
      </p>
    </div>
  );
}
