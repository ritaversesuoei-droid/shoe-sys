"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AttendanceRow {
  id: string;
  workDate: string;
  driverName: string;
  driverCode: string | null;
  actualIn: string | null;
  actualOut: string | null;
  editedIn: string | null;
  editedOut: string | null;
  inAdj: number;
  outAdj: number;
  restTime: string; // interval "HH:MM:SS"
  restraintMin: number | null;
  laborMin: number | null;
  nightMin: number | null;
  warn: string | null;
  revisionStatus: string;
  revisionReason: string | null;
  closed: boolean;
}

const hm = (t: string | null): string => (t ? t.slice(0, 5) : "");
const intervalToMin = (v: string | null): number => {
  if (!v) return 0;
  const m = /^(\d+):(\d{2})/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const hhmm = (min: number | null): string => {
  if (min == null) return "—";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
};

const inputCls = "rounded-lg border border-slate-300 px-2 py-2 text-base";

/** 勤怠修正テーブル（行内編集 → 保存で再計算）。状態を色・アイコンで表示。 */
export default function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="p-3 whitespace-nowrap">状態</th>
            <th className="p-3 whitespace-nowrap">日付 / ドライバー</th>
            <th className="p-3 whitespace-nowrap">実績(出/退)</th>
            <th className="p-3 whitespace-nowrap">修正 出勤</th>
            <th className="p-3 whitespace-nowrap">修正 退勤</th>
            <th className="p-3 whitespace-nowrap">休憩(分)</th>
            <th className="p-3 text-right whitespace-nowrap">拘束 / 労働 / 深夜</th>
            <th className="p-3 whitespace-nowrap">理由</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <EditableRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableRow({ row }: { row: AttendanceRow }) {
  const router = useRouter();
  const [editedIn, setEditedIn] = useState(hm(row.editedIn ?? row.actualIn));
  const [editedOut, setEditedOut] = useState(hm(row.editedOut ?? row.actualOut));
  const [inAdj, setInAdj] = useState(row.inAdj);
  const [outAdj, setOutAdj] = useState(row.outAdj);
  const [restMin, setRestMin] = useState(intervalToMin(row.restTime));
  const [reason, setReason] = useState(row.revisionReason ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    setDone(false);
    try {
      const res = await fetch(`/api/admin/shifts/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edited_in: editedIn || null,
          edited_out: editedOut || null,
          edited_in_adj_days: inAdj,
          edited_out_adj_days: outAdj,
          rest_min: restMin,
          revision_reason: reason || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "保存に失敗しました");
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗");
    } finally {
      setSaving(false);
    }
  }

  // 行の色: 警告=赤, 修正済=黄, それ以外=白
  const rowBg = row.warn ? "bg-rose-50" : row.revisionStatus === "edited" ? "bg-amber-50" : "";
  const statusIcon = row.warn ? "⚠️" : row.revisionStatus === "edited" ? "✏️" : "✅";

  const adjSel = (v: number, on: (n: number) => void, label: string) => (
    <label className="flex items-center gap-1 text-xs text-slate-500">
      {label}
      <select value={v} onChange={(e) => on(Number(e.target.value))} className="rounded-lg border border-slate-300 px-1 py-1.5 text-sm">
        <option value={0}>当日</option>
        <option value={1}>翌日</option>
        <option value={2}>翌々</option>
      </select>
    </label>
  );

  return (
    <tr className={`border-t align-top ${rowBg}`}>
      <td className="p-3 text-center text-xl" title={row.warn ?? (row.revisionStatus === "edited" ? "修正済" : "通常")}>{statusIcon}</td>
      <td className="p-3 whitespace-nowrap">
        <div className="font-bold">{row.workDate.slice(5)}</div>
        <div className="text-slate-600">{row.driverName}<span className="ml-1 text-xs text-slate-400">{row.driverCode}</span></div>
      </td>
      <td className="p-3 whitespace-nowrap text-slate-500">{hm(row.actualIn) || "—"}<br />{hm(row.actualOut) || "—"}</td>
      <td className="p-3">
        <input type="time" value={editedIn} onChange={(e) => setEditedIn(e.target.value)} className={`${inputCls} w-28`} />
        <div className="mt-1">{adjSel(inAdj, setInAdj, "")}</div>
      </td>
      <td className="p-3">
        <input type="time" value={editedOut} onChange={(e) => setEditedOut(e.target.value)} className={`${inputCls} w-28`} />
        <div className="mt-1">{adjSel(outAdj, setOutAdj, "")}</div>
      </td>
      <td className="p-3"><input type="number" min={0} step={5} value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} className={`${inputCls} w-20`} /></td>
      <td className="p-3 text-right whitespace-nowrap font-mono">
        <span className={row.warn ? "font-bold text-rose-600" : ""}>{hhmm(row.restraintMin)}</span> / {hhmm(row.laborMin)} / {row.nightMin ?? "—"}
        {row.warn && <div className="mt-1 max-w-[14rem] text-right text-xs font-normal text-rose-600">{row.warn}</div>}
      </td>
      <td className="p-3"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="修正理由" className={`${inputCls} w-32`} /></td>
      <td className="p-3 whitespace-nowrap">
        <button onClick={save} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-base font-bold text-white disabled:opacity-50">
          {saving ? "保存中…" : done ? "✓ 保存" : "保存"}
        </button>
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      </td>
    </tr>
  );
}
