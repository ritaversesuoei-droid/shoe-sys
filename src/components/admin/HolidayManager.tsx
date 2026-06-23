"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DayClass = "holiday" | "workday";
type Holiday = { date: string; name: string };

/**
 * 月次の休日区分 手修正（F-14）。当月の祝日（算出）を表示し、任意日の区分を上書きできる。
 * 上書き後は月次を再取得（router.refresh）し、休日労働を即再計算。
 */
export default function HolidayManager({
  month,
  holidays,
  initialOverrides,
}: {
  month: string; // yyyyMM
  holidays: Holiday[];
  initialOverrides: Record<string, DayClass>;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, DayClass>>(initialOverrides);
  const [date, setDate] = useState(`${month.slice(0, 4)}-${month.slice(4)}-01`);
  const [cls, setCls] = useState<"holiday" | "workday" | "auto">("holiday");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply(targetDate: string, classification: "holiday" | "workday" | "auto") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/holidays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: targetDate, classification }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "更新に失敗しました");
      setOverrides(json.overrides ?? {});
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const ovEntries = Object.entries(overrides).filter(([d]) => d.slice(0, 7) === `${month.slice(0, 4)}-${month.slice(4)}`);

  return (
    <section className="mt-6 rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-bold text-slate-700">休日設定（当月）</h2>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {holidays.length === 0 ? (
          <span className="text-slate-400">当月に祝日はありません</span>
        ) : (
          holidays.map((h) => (
            <span key={h.date} className="rounded bg-rose-50 px-2 py-1 text-rose-700">
              {h.date.slice(8)}日 {h.name}
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          日付
          <input
            type="date"
            value={date}
            min={`${month.slice(0, 4)}-${month.slice(4)}-01`}
            onChange={(e) => setDate(e.target.value)}
            className="ml-1 rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <select value={cls} onChange={(e) => setCls(e.target.value as typeof cls)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="holiday">休日にする</option>
          <option value="workday">出勤日にする</option>
          <option value="auto">自動に戻す</option>
        </select>
        <button
          onClick={() => apply(date, cls)}
          disabled={busy}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          適用
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {ovEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="text-slate-500">手修正:</span>
          {ovEntries.map(([d, c]) => (
            <span key={d} className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-amber-800">
              {d.slice(5)} → {c === "holiday" ? "休日" : "出勤日"}
              <button onClick={() => apply(d, "auto")} disabled={busy} className="text-amber-600 hover:text-amber-900" title="自動に戻す">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
