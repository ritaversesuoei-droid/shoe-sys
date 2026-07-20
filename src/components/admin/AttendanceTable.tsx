"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PunchHistory } from "./PunchHistory";

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
  confirmed: boolean;
  // 改善基準告示の特例（要社労士確認）
  crewType: string;
  ferryMin: number;
  splitRest: boolean;
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

/** 勤怠修正テーブル（行内編集 → 保存で再計算）。チェック→一括確認・違反ソート・1日の動き表示。 */
export default function AttendanceTable({ rows, focus }: { rows: AttendanceRow[]; focus?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [violationsOnly, setViolationsOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (violationsOnly ? rows.filter((r) => r.warn) : rows),
    [rows, violationsOnly],
  );
  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const n = new Set(prev);
      visible.forEach((r) => n.add(r.id));
      return n;
    });
  }

  async function bulkConfirm(confirmed: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shifts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, confirmed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "失敗しました");
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* ツールバー（③(1)(2)） */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4" />
          全選択
        </label>
        <button
          onClick={() => bulkConfirm(true)}
          disabled={busy || selected.size === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          ✓ 確認済みにする（{selected.size}）
        </button>
        <button
          onClick={() => bulkConfirm(false)}
          disabled={busy || selected.size === 0}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 disabled:opacity-40"
        >
          未確認へ戻す
        </button>
        <button
          onClick={() => setViolationsOnly((v) => !v)}
          className={`ml-auto rounded-lg px-4 py-2 text-sm font-bold ${violationsOnly ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          {violationsOnly ? "⚠ 違反のみ表示中" : "⚠ 違反のみ"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="p-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4" /></th>
              <th className="p-3 whitespace-nowrap">状態</th>
              <th className="p-3 whitespace-nowrap">日付 / ドライバー</th>
              <th className="p-3 whitespace-nowrap">実績(出/退)</th>
              <th className="p-3 whitespace-nowrap">修正 出勤</th>
              <th className="p-3 whitespace-nowrap">修正 退勤</th>
              <th className="p-3 whitespace-nowrap">休憩(分)</th>
              <th className="p-3 text-right whitespace-nowrap">拘束 / 労働 / 深夜</th>
              <th className="p-3 whitespace-nowrap">特例<br /><span className="text-xs font-normal text-slate-400">要社労士</span></th>
              <th className="p-3 whitespace-nowrap">理由</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <EditableRow
                key={r.id}
                row={r}
                checked={selected.has(r.id)}
                onToggle={() => toggle(r.id)}
                focus={focus === r.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-slate-400">表示する勤務がありません</p>
      )}
    </div>
  );
}

function EditableRow({ row, checked, onToggle, focus }: { row: AttendanceRow; checked: boolean; onToggle: () => void; focus: boolean }) {
  const router = useRouter();
  const [editedIn, setEditedIn] = useState(hm(row.editedIn ?? row.actualIn));
  const [editedOut, setEditedOut] = useState(hm(row.editedOut ?? row.actualOut));
  const [inAdj, setInAdj] = useState(row.inAdj);
  const [outAdj, setOutAdj] = useState(row.outAdj);
  const [restMin, setRestMin] = useState(intervalToMin(row.restTime));
  const [reason, setReason] = useState(row.revisionReason ?? "");
  const [crewType, setCrewType] = useState<"single" | "double">(row.crewType === "double" ? "double" : "single");
  const [ferryMin, setFerryMin] = useState(row.ferryMin ?? 0);
  const [splitRest, setSplitRest] = useState(row.splitRest);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(focus);

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
          crew_type: crewType,
          ferry_min: ferryMin,
          split_rest: splitRest,
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

  const rowBg = focus ? "bg-blue-50" : row.warn ? "bg-rose-50" : row.confirmed ? "bg-emerald-50/40" : row.revisionStatus === "edited" ? "bg-amber-50" : "";
  const statusIcon = row.confirmed ? "✅" : row.warn ? "⚠️" : row.revisionStatus === "edited" ? "✏️" : "•";

  const adjSel = (v: number, on: (n: number) => void) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))} className="rounded-lg border border-slate-300 px-1 py-1.5 text-sm">
      <option value={0}>当日</option>
      <option value={1}>翌日</option>
      <option value={2}>翌々</option>
    </select>
  );

  return (
    <Fragment>
      <tr className={`border-t align-top ${rowBg}`}>
        <td className="p-3"><input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" /></td>
        <td className="p-3 text-center text-xl" title={row.confirmed ? "確認済み" : row.warn ?? (row.revisionStatus === "edited" ? "修正済" : "通常")}>{statusIcon}</td>
        <td className="p-3 whitespace-nowrap">
          <div className="font-bold">{row.workDate.slice(5)}</div>
          <div className="text-slate-600">{row.driverName}<span className="ml-1 text-xs text-slate-400">{row.driverCode}</span></div>
        </td>
        <td className="p-3 whitespace-nowrap text-slate-500">{hm(row.actualIn) || "—"}<br />{hm(row.actualOut) || "—"}</td>
        <td className="p-3">
          <input type="time" value={editedIn} onChange={(e) => setEditedIn(e.target.value)} className={`${inputCls} w-28`} />
          <div className="mt-1">{adjSel(inAdj, setInAdj)}</div>
        </td>
        <td className="p-3">
          <input type="time" value={editedOut} onChange={(e) => setEditedOut(e.target.value)} className={`${inputCls} w-28`} />
          <div className="mt-1">{adjSel(outAdj, setOutAdj)}</div>
        </td>
        <td className="p-3"><input type="number" min={0} step={5} value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} className={`${inputCls} w-20`} /></td>
        <td className="p-3 text-right whitespace-nowrap font-mono">
          <span className={row.warn ? "font-bold text-rose-600" : ""}>{hhmm(row.restraintMin)}</span> / {hhmm(row.laborMin)} / {row.nightMin ?? "—"}
          {row.warn && <div className="mt-1 max-w-[14rem] text-right text-xs font-normal text-rose-600">{row.warn}</div>}
        </td>
        <td className="p-3 whitespace-nowrap">
          <select value={crewType} onChange={(e) => setCrewType(e.target.value as "single" | "double")} className="rounded-lg border border-slate-300 px-1 py-1.5 text-sm">
            <option value="single">通常</option>
            <option value="double">2人乗務</option>
          </select>
          <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            ﾌｪﾘｰ<input type="number" min={0} step={30} value={ferryMin} onChange={(e) => setFerryMin(Number(e.target.value))} className="w-16 rounded border border-slate-300 px-1 py-1 text-sm" />分
          </label>
          <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={splitRest} onChange={(e) => setSplitRest(e.target.checked)} className="h-4 w-4" />分割休息
          </label>
        </td>
        <td className="p-3"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="修正理由" className={`${inputCls} w-32`} /></td>
        <td className="p-3 whitespace-nowrap">
          <button onClick={save} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-base font-bold text-white disabled:opacity-50">
            {saving ? "保存中…" : done ? "✓ 保存" : "保存"}
          </button>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">
            {open ? "▲ 閉じる" : "▼ 1日の動き"}
          </button>
          {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        </td>
      </tr>
      {open && (
        <tr className={rowBg}>
          <td colSpan={11} className="px-3 pb-3">
            <PunchHistory shiftId={row.id} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
