"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 出勤指示時間パネル（/admin/dispatch）。日別×ドライバー別に出勤指示時間(HH:MM)を設定。
 *   - ここで設定した時刻より早くドライバーが通常出勤しようとすると、打刻画面でアラート＋同意が必要になる。
 *   - 保存先は app_settings（dispatch_plans のシート同期に消されない別キー）。
 */
export function AttendanceInstructionPanel({
  date,
  drivers,
  initial,
}: {
  date: string;
  drivers: { id: string; name: string }[];
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [times, setTimes] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setCount = Object.values(times).filter(Boolean).length;

  async function save(driverId: string, time: string) {
    setBusy(driverId);
    setErr(null);
    try {
      const res = await fetch("/api/admin/attendance-instructions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: driverId, date, time: time || null }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      setTimes((prev) => {
        const next = { ...prev };
        if (time) next[driverId] = time;
        else delete next[driverId];
        return next;
      });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 print:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-base font-bold text-indigo-800">
          ⏰ 出勤指示時間（{date}・ドライバー別）
          {setCount > 0 && <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">{setCount}名 設定済</span>}
        </span>
        <span className="text-sm text-indigo-500">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="border-t border-indigo-200 px-4 py-3">
          <p className="mb-3 text-xs text-slate-500">
            指示時間より早い出勤は、ドライバーの打刻画面でアラート＋同意チェックが必要になります（同意しないと出勤ボタンは押せません）。
            空欄にすると解除。猶予（何分前からアラートか）は設定画面で変更できます。
          </p>
          {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
          {drivers.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">この日に配車のある登録ドライバーがいません。</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {drivers.map((d) => (
                <label key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="truncate text-sm font-bold text-slate-700">{d.name}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="time"
                      defaultValue={times[d.id] ?? ""}
                      disabled={busy === d.id}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (times[d.id] ?? "")) save(d.id, v);
                      }}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline focus:outline-1 focus:outline-indigo-500"
                    />
                    {busy === d.id && <span className="text-xs text-indigo-600">…</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
