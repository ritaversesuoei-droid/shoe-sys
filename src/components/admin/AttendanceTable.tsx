"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
const WD = ["日", "月", "火", "水", "木", "金", "土"] as const;
const dow = (workDate: string): string => WD[new Date(`${workDate}T00:00:00Z`).getUTCDay()] ?? "";
/** 労基法34条: 労働6h超→45分、8h超→60分 の必要休憩。 */
const requiredRest = (labor: number | null): number => (labor == null ? 0 : labor > 480 ? 60 : labor > 360 ? 45 : 0);
const crewLabel = (c: string): string => (c === "double" ? "2人乗務" : "通常");
const statusLabel = (r: AttendanceRow): string =>
  r.confirmed ? "確認済" : r.warn ? "違反" : r.revisionStatus === "edited" ? "修正済" : "通常";

const inputCls = "rounded-lg border border-slate-300 px-2 py-2 text-base";
// エクセル表示（密なグリッド）
const xcell = "border border-slate-200 px-1.5 py-1 align-top";
const xhead = "border border-slate-200 bg-slate-100 px-1.5 py-1 whitespace-nowrap text-slate-600";
const xinput = "rounded border border-slate-300 px-1 py-0.5 text-xs";
const VIEW_KEY = "shoei_attendance_view";

/** 勤怠修正テーブル（行内編集 → 保存で再計算）。カード表示／エクセル表示を切替、詳細パネルで全項目＋打刻履歴。 */
export default function AttendanceTable({ rows, focus }: { rows: AttendanceRow[]; focus?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [violationsOnly, setViolationsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"card" | "excel">("card");

  // 表示モードは端末に記憶（エクセル派の人はエクセルのまま使える）
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "excel" || v === "card") setView(v);
    } catch {
      /* localStorage 不可は既定(card) */
    }
  }, []);
  const changeView = (v: "card" | "excel") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 保存不可は無視 */
    }
  };

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
      {/* ツールバー */}
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

        {/* 表示切替（カード / エクセル） */}
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-300">
          <button
            onClick={() => changeView("card")}
            className={`px-4 py-2 text-sm font-bold ${view === "card" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
          >
            🗂 カード表示
          </button>
          <button
            onClick={() => changeView("excel")}
            className={`px-4 py-2 text-sm font-bold ${view === "excel" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
          >
            📊 エクセル表示
          </button>
        </div>
        <button
          onClick={() => setViolationsOnly((v) => !v)}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${violationsOnly ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          {violationsOnly ? "⚠ 違反のみ表示中" : "⚠ 違反のみ"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        {view === "excel" ? (
          <table className="w-full min-w-[1180px] border-collapse text-xs">
            <thead className="text-left">
              <tr>
                <th className={xhead}></th>
                <th className={xhead}>状態</th>
                <th className={xhead}>日付</th>
                <th className={xhead}>曜</th>
                <th className={xhead}>ｺｰﾄﾞ</th>
                <th className={xhead}>ドライバー</th>
                <th className={xhead}>実出</th>
                <th className={xhead}>実退</th>
                <th className={xhead}>修出</th>
                <th className={xhead}>出補</th>
                <th className={xhead}>修退</th>
                <th className={xhead}>退補</th>
                <th className={xhead}>休憩</th>
                <th className={xhead}>必休</th>
                <th className={`${xhead} text-right`}>拘束</th>
                <th className={`${xhead} text-right`}>労働</th>
                <th className={`${xhead} text-right`}>深夜</th>
                <th className={xhead}>乗務</th>
                <th className={xhead}>ﾌｪﾘｰ</th>
                <th className={xhead}>分割</th>
                <th className={xhead}>確認</th>
                <th className={xhead}>理由</th>
                <th className={xhead}>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <EditableRow key={r.id} row={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} focus={focus === r.id} variant="excel" />
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="p-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4" /></th>
                <th className="p-3 whitespace-nowrap">状態</th>
                <th className="p-3 whitespace-nowrap">日付 / ドライバー</th>
                <th className="p-3 whitespace-nowrap">実績(出/退)</th>
                <th className="p-3 whitespace-nowrap">修正 出勤</th>
                <th className="p-3 whitespace-nowrap">修正 退勤</th>
                <th className="p-3 whitespace-nowrap">休憩(分)<br /><span className="text-xs font-normal text-slate-400">必要=34条</span></th>
                <th className="p-3 text-right whitespace-nowrap">拘束 / 労働 / 深夜</th>
                <th className="p-3 whitespace-nowrap">特例<br /><span className="text-xs font-normal text-slate-400">要社労士</span></th>
                <th className="p-3 whitespace-nowrap">理由</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <EditableRow key={r.id} row={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} focus={focus === r.id} variant="card" />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {visible.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-slate-400">表示する勤務がありません</p>
      )}
    </div>
  );
}

/** 詳細パネル（全項目の表記＋1日の動き）。詳細ボタンで開閉。カード/エクセル共通。 */
function DetailPanel({ row }: { row: AttendanceRow }) {
  const reqRest = requiredRest(row.laborMin);
  const restMin = intervalToMin(row.restTime);
  const field = (label: string, value: ReactNode, cls?: string) => (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-slate-400">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 ${cls ?? ""}`}>{value}</span>
    </div>
  );
  const adj = (n: number) => (n ? `(+${n}日)` : "");
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
        {field("日付", `${row.workDate}（${dow(row.workDate)}）`)}
        {field("ドライバー", `${row.driverName}${row.driverCode ? ` (${row.driverCode})` : ""}`)}
        {field("実績 出→退", `${hm(row.actualIn) || "—"} → ${hm(row.actualOut) || "—"}`)}
        {field("修正 出→退", `${hm(row.editedIn) || "—"}${adj(row.inAdj)} → ${hm(row.editedOut) || "—"}${adj(row.outAdj)}`)}
        {field("拘束", hhmm(row.restraintMin), row.warn ? "text-rose-600" : "")}
        {field("労働", hhmm(row.laborMin))}
        {field("深夜", row.nightMin != null ? `${row.nightMin}分` : "—")}
        {field("休憩 実/必要(34条)", `${restMin}分 / ${reqRest}分`, restMin < reqRest ? "text-rose-600" : "")}
        {field("乗務区分", crewLabel(row.crewType))}
        {field("フェリー", row.ferryMin ? `${row.ferryMin}分` : "—")}
        {field("分割休息", row.splitRest ? "該当" : "—")}
        {field("状態", statusLabel(row))}
        {field("確定", row.confirmed ? "確認済" : "未確認")}
        {field("修正理由", row.revisionReason || "—")}
      </div>
      {row.warn && (
        <div className="mb-3 space-y-0.5 rounded-md bg-rose-50 p-2 text-xs text-rose-700">
          {row.warn.split(" / ").map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
      <p className="mb-1 text-xs font-bold text-slate-500">1日の動き（打刻履歴）</p>
      <PunchHistory shiftId={row.id} />
    </div>
  );
}

function EditableRow({
  row,
  checked,
  onToggle,
  focus,
  variant,
}: {
  row: AttendanceRow;
  checked: boolean;
  onToggle: () => void;
  focus: boolean;
  variant: "card" | "excel";
}) {
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
  const reqRest = requiredRest(row.laborMin);

  const adjSel = (v: number, on: (n: number) => void, compact = false) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))} className={compact ? `${xinput} w-14` : "rounded-lg border border-slate-300 px-1 py-1.5 text-sm"}>
      <option value={0}>当日</option>
      <option value={1}>翌日</option>
      <option value={2}>翌々</option>
    </select>
  );

  const detailRow = open && (
    <tr className={rowBg}>
      <td colSpan={99} className="px-3 pb-3">
        <DetailPanel row={row} />
      </td>
    </tr>
  );

  // ── エクセル表示（密なグリッド。修正項目は行内編集） ──
  if (variant === "excel") {
    return (
      <Fragment>
        <tr className={`${rowBg}`}>
          <td className={xcell}><input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" /></td>
          <td className={`${xcell} text-center`} title={statusLabel(row)}>{statusIcon}</td>
          <td className={`${xcell} whitespace-nowrap font-bold`}>{row.workDate.slice(5)}</td>
          <td className={`${xcell} text-center text-slate-500`}>{dow(row.workDate)}</td>
          <td className={`${xcell} text-slate-500`}>{row.driverCode ?? "—"}</td>
          <td className={`${xcell} whitespace-nowrap`}>{row.driverName}</td>
          <td className={`${xcell} font-mono text-slate-500`}>{hm(row.actualIn) || "—"}</td>
          <td className={`${xcell} font-mono text-slate-500`}>{hm(row.actualOut) || "—"}</td>
          <td className={xcell}><input type="time" value={editedIn} onChange={(e) => setEditedIn(e.target.value)} className={`${xinput} w-24`} /></td>
          <td className={xcell}>{adjSel(inAdj, setInAdj, true)}</td>
          <td className={xcell}><input type="time" value={editedOut} onChange={(e) => setEditedOut(e.target.value)} className={`${xinput} w-24`} /></td>
          <td className={xcell}>{adjSel(outAdj, setOutAdj, true)}</td>
          <td className={xcell}><input type="number" min={0} step={5} value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} className={`${xinput} w-14`} /></td>
          <td className={`${xcell} text-center ${restMin < reqRest ? "font-bold text-rose-600" : "text-slate-400"}`}>{reqRest || "—"}</td>
          <td className={`${xcell} text-right font-mono ${row.warn ? "font-bold text-rose-600" : ""}`}>{hhmm(row.restraintMin)}</td>
          <td className={`${xcell} text-right font-mono`}>{hhmm(row.laborMin)}</td>
          <td className={`${xcell} text-right font-mono`}>{row.nightMin ?? "—"}</td>
          <td className={xcell}>
            <select value={crewType} onChange={(e) => setCrewType(e.target.value as "single" | "double")} className={`${xinput} w-16`}>
              <option value="single">通常</option>
              <option value="double">2人</option>
            </select>
          </td>
          <td className={xcell}><input type="number" min={0} step={30} value={ferryMin} onChange={(e) => setFerryMin(Number(e.target.value))} className={`${xinput} w-12`} /></td>
          <td className={`${xcell} text-center`}><input type="checkbox" checked={splitRest} onChange={(e) => setSplitRest(e.target.checked)} className="h-4 w-4" /></td>
          <td className={`${xcell} text-center`}>{row.confirmed ? "✅" : "—"}</td>
          <td className={xcell}><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由" className={`${xinput} w-28`} /></td>
          <td className={`${xcell} whitespace-nowrap`}>
            <button onClick={save} disabled={saving} className="rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">
              {saving ? "…" : done ? "✓" : "保存"}
            </button>
            <button onClick={() => setOpen((o) => !o)} className="ml-1 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-600">
              {open ? "▲" : "詳細"}
            </button>
            {err && <div className="text-[10px] text-red-600">{err}</div>}
          </td>
        </tr>
        {detailRow}
      </Fragment>
    );
  }

  // ── カード表示（従来の見やすいレイアウト＋曜日・必要休憩・詳細ボタン） ──
  return (
    <Fragment>
      <tr className={`border-t align-top ${rowBg}`}>
        <td className="p-3"><input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" /></td>
        <td className="p-3 text-center text-xl" title={row.confirmed ? "確認済み" : row.warn ?? (row.revisionStatus === "edited" ? "修正済" : "通常")}>{statusIcon}</td>
        <td className="p-3 whitespace-nowrap">
          <div className="font-bold">{row.workDate.slice(5)}<span className="ml-1 text-xs font-normal text-slate-400">({dow(row.workDate)})</span></div>
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
        <td className="p-3">
          <input type="number" min={0} step={5} value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} className={`${inputCls} w-20`} />
          <div className={`mt-1 text-xs ${restMin < reqRest ? "font-bold text-rose-600" : "text-slate-400"}`}>必要 {reqRest}分</div>
        </td>
        <td className="p-3 text-right font-mono">
          <span className="whitespace-nowrap">
            <span className={row.warn ? "font-bold text-rose-600" : ""}>{hhmm(row.restraintMin)}</span> / {hhmm(row.laborMin)} / {row.nightMin ?? "—"}
          </span>
          {row.warn && (
            <div className="mt-1 ml-auto w-[15rem] max-w-full space-y-0.5 whitespace-normal break-words text-right text-xs font-normal font-sans leading-snug text-rose-600">
              {row.warn.split(" / ").map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
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
            {open ? "▲ 閉じる" : "▼ 詳細"}
          </button>
          {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        </td>
      </tr>
      {detailRow}
    </Fragment>
  );
}
