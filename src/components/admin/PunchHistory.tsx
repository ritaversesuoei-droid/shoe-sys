"use client";

import { useEffect, useState } from "react";

/**
 * 1勤務の「その日の動き」＝打刻履歴（③(4)）＋前日退勤/当日出勤/当日退勤の時刻（③(5)）。
 * 勤怠修正・警告の両画面から、行を開いたときに GET /api/admin/shifts/:id を読んで表示する。
 */
const LABEL: Record<string, string> = {
  departure: "出発", leg_departure: "各駅出発", arrival: "到着", loading: "積込",
  unloading: "荷卸", long_rest: "長距離休憩", clock_out: "退勤", rest_start: "休憩開始", rest_end: "休憩終了",
};

function hhmm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

interface EvItem { shipper?: string | null; delivery_spot?: string | null; quantity?: string | null; weight?: string | null; cargo_type?: string | null; receipts?: string | null }
interface Ev { id: string; event_type: string; occurred_at: string; vehicle_no: string | null; address: string | null; note: string | null; event_items: EvItem[] | null }
interface Data { events: Ev[]; prevClockOut: string | null; shift: { clockIn: string | null; clockOut: string | null } }

export function PunchHistory({ shiftId }: { shiftId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/shifts/${shiftId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) (d.success ? setData(d) : setErr(d.error ?? "取得失敗")); })
      .catch((e) => { if (alive) setErr(String(e)); });
    return () => { alive = false; };
  }, [shiftId]);

  if (err) return <p className="p-2 text-xs text-red-600">{err}</p>;
  if (!data) return <p className="p-2 text-xs text-slate-400">読込中…</p>;

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="text-slate-500">前日退勤 <b className="font-mono text-slate-800">{hhmm(data.prevClockOut)}</b></span>
        <span className="text-slate-500">当日出勤 <b className="font-mono text-slate-800">{hhmm(data.shift.clockIn)}</b></span>
        <span className="text-slate-500">当日退勤 <b className="font-mono text-slate-800">{hhmm(data.shift.clockOut)}</b></span>
      </div>
      {data.events.length === 0 ? (
        <p className="text-xs text-slate-400">打刻がありません</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {data.events.map((e) => {
            const items = (e.event_items ?? [])
              .map((it) => [it.shipper, it.delivery_spot, it.quantity, it.weight, it.cargo_type, it.receipts].filter(Boolean).join(" "))
              .filter(Boolean);
            const place = [e.address, ...items].filter(Boolean).join(" / ");
            return (
              <li key={e.id} className="flex gap-2 text-xs">
                <span className="w-10 shrink-0 font-mono text-slate-500">{hhmm(e.occurred_at)}</span>
                <span className="w-16 shrink-0 font-bold text-slate-700">{LABEL[e.event_type] ?? e.event_type}</span>
                <span className="text-slate-600">{place || "—"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
