"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { alertLabel } from "@/lib/alert-labels";
import { PunchHistory } from "./PunchHistory";

interface DetailItem {
  type?: string;
  severity?: string;
  message?: string;
}
interface Warning {
  id: string;
  shift_id: string | null;
  driver_id: string;
  work_date: string;
  month_key: string;
  alert_types: string[];
  restraint_min: number | null;
  labor_min: number | null;
  rest_period_min: number | null;
  night_min: number | null;
  detail: DetailItem[] | Record<string, unknown> | null;
  status: "open" | "resolved";
  correction_reason: string | null;
  correction_note: string | null;
  corrected_at: string | null;
  drivers: { code: string; name: string } | null;
  // ③(5) 時刻
  clock_in: string | null;
  clock_out: string | null;
  prev_clock_out: string | null;
}

type Filter = "open" | "resolved" | "all";

function hm(min: number | null): string {
  if (min == null) return "-";
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, "0")}`;
}
function hhmmIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function WarningList() {
  const [filter, setFilter] = useState<Filter>("open");
  const [items, setItems] = useState<Warning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    const q = filter === "all" ? "" : `?status=${filter}`;
    try {
      const res = await fetch(`/api/admin/warnings${q}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems(data.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCorrection(id: string) {
    if (!reason.trim()) {
      setError("是正理由は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/warnings/${id}/correction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction_reason: reason, correction_note: note || undefined, resolve: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEditing(null);
      setReason("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["open", "resolved", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-5 py-2.5 text-base font-bold ${filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {f === "open" ? "🔴 未対応" : f === "resolved" ? "✅ 解消済" : "すべて"}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {items === null && !error && <p className="text-slate-400">読込中...</p>}
      {items?.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-slate-400">該当する警告はありません</p>}

      <ul className="flex flex-col gap-3">
        {items?.map((w) => {
          const detail = Array.isArray(w.detail) ? (w.detail as DetailItem[]) : [];
          return (
            <li key={w.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-bold">{w.drivers?.name ?? "(不明)"}</span>
                  <span className="ml-2 text-sm text-slate-500">{w.drivers?.code} / {w.work_date}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${w.status === "open" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                  {w.status === "open" ? "未対応" : "解消済"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {w.alert_types.map((t) => {
                  const a = alertLabel(t);
                  return (
                    <span key={t} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold ${a.cls}`}>
                      {a.icon} {a.label}
                    </span>
                  );
                })}
              </div>

              <div className="mt-2 text-sm text-slate-600">
                拘束 {hm(w.restraint_min)} / 労働 {hm(w.labor_min)} / 休息 {hm(w.rest_period_min)} / 深夜 {hm(w.night_min)}
              </div>
              {/* ③(5) 前日退勤・当日出勤・当日退勤 */}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                <span>前日退勤 <b className="font-mono text-slate-700">{hhmmIso(w.prev_clock_out)}</b></span>
                <span>当日出勤 <b className="font-mono text-slate-700">{hhmmIso(w.clock_in)}</b></span>
                <span>当日退勤 <b className="font-mono text-slate-700">{hhmmIso(w.clock_out)}</b></span>
              </div>
              {detail.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {detail.filter((d) => d.severity !== "info").map((d, i) => <li key={i}>・{d.message}</li>)}
                </ul>
              )}

              {/* ③(3) 勤怠修正で編集 / ③(4) 1日の動き */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={`/admin/attendance?month=${w.month_key}&view=all${w.driver_id ? `&driver=${w.driver_id}` : ""}${w.shift_id ? `&focus=${w.shift_id}` : ""}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  ✏️ 勤怠修正で編集
                </Link>
                {w.shift_id && (
                  <button
                    onClick={() => setOpenHistory((v) => (v === w.id ? null : w.id))}
                    className="text-slate-600 hover:underline"
                  >
                    {openHistory === w.id ? "▲ 閉じる" : "▼ 1日の動き"}
                  </button>
                )}
              </div>
              {openHistory === w.id && w.shift_id && (
                <div className="mt-2"><PunchHistory shiftId={w.shift_id} /></div>
              )}

              {w.status === "resolved" ? (
                <div className="mt-3 rounded bg-slate-50 p-2 text-sm">
                  <div className="font-medium text-slate-700">是正理由</div>
                  <div className="text-slate-600">{w.correction_reason}</div>
                  {w.correction_note && <div className="mt-1 text-slate-500">指導: {w.correction_note}</div>}
                </div>
              ) : editing === w.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea placeholder="是正理由（必須）" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  <textarea placeholder="是正指導内容（任意）" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => submitCorrection(w.id)} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50">
                      {saving ? "登録中..." : "解消して登録"}
                    </button>
                    <button onClick={() => { setEditing(null); setReason(""); setNote(""); }} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">キャンセル</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditing(w.id); setReason(""); setNote(""); }} className="mt-3 rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white">
                  ✍️ 是正を登録
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
