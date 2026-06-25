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
  if (min == null) return "-";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
};

/** 勤怠修正テーブル（行内編集 → 保存で再計算）。 */
export default function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="p-2 whitespace-nowrap">日付</th>
            <th className="p-2 whitespace-nowrap">ドライバー</th>
            <th className="p-2 whitespace-nowrap">実績(出/退)</th>
            <th className="p-2 whitespace-nowrap">修正出勤</th>
            <th className="p-2">補</th>
            <th className="p-2 whitespace-nowrap">修正退勤</th>
            <th className="p-2">補</th>
            <th className="p-2 whitespace-nowrap">休憩(分)</th>
            <th className="p-2 text-right whitespace-nowrap">拘束/労働/深夜</th>
            <th className="p-2">警告</th>
            <th className="p-2">理由</th>
            <th className="p-2"></th>
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
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
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
      setMsg("✓");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失敗");
    } finally {
      setSaving(false);
    }
  }

  const adjSel = (v: number, on: (n: number) => void) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))} className="w-12 rounded border border-slate-300 px-1 py-1 text-xs">
      <option value={0}>0</option>
      <option value={1}>+1</option>
      <option value={2}>+2</option>
    </select>
  );

  return (
    <tr className={`border-t ${row.revisionStatus === "edited" ? "bg-amber-50/40" : ""}`}>
      <td className="p-2 whitespace-nowrap">{row.workDate.slice(5)}</td>
      <td className="p-2 whitespace-nowrap">
        <span className="font-medium">{row.driverName}</span>
        <span className="ml-1 text-xs text-slate-400">{row.driverCode}</span>
      </td>
      <td className="p-2 whitespace-nowrap text-xs text-slate-500">{hm(row.actualIn) || "—"}/{hm(row.actualOut) || "—"}</td>
      <td className="p-2"><input type="time" value={editedIn} onChange={(e) => setEditedIn(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-xs" /></td>
      <td className="p-2">{adjSel(inAdj, setInAdj)}</td>
      <td className="p-2"><input type="time" value={editedOut} onChange={(e) => setEditedOut(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-xs" /></td>
      <td className="p-2">{adjSel(outAdj, setOutAdj)}</td>
      <td className="p-2"><input type="number" min={0} value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} className="w-16 rounded border border-slate-300 px-1 py-1 text-xs" /></td>
      <td className="p-2 text-right whitespace-nowrap text-xs">{hhmm(row.restraintMin)} / {hhmm(row.laborMin)} / {row.nightMin ?? "-"}分</td>
      <td className="p-2 text-xs text-red-600 max-w-[12rem]">{row.warn ?? ""}</td>
      <td className="p-2"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="修正理由" className="w-28 rounded border border-slate-300 px-1 py-1 text-xs" /></td>
      <td className="p-2 whitespace-nowrap">
        <button onClick={save} disabled={saving} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">{saving ? "..." : "保存"}</button>
        {msg && <span className={`ml-1 text-xs ${msg === "✓" ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
      </td>
    </tr>
  );
}
