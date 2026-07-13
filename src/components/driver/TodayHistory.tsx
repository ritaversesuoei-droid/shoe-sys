"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LABEL: Record<string, string> = {
  departure: "出発",
  leg_departure: "各駅出発",
  arrival: "到着",
  loading: "積込",
  unloading: "荷卸",
  long_rest: "長距離休憩",
  clock_out: "退勤",
  rest_start: "休憩開始",
  rest_end: "休憩終了",
};

interface EventItem {
  shipper?: string | null;
  delivery_spot?: string | null;
  quantity?: string | null;
  weight?: string | null;
  cargo_type?: string | null;
  receipts?: string | null;
}
interface EventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  vehicle_no: string | null;
  address: string | null;
  event_items: EventItem[] | null;
}

function hhmm(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function TodayHistory() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events/today")
      .then((r) => r.json())
      .then((d) => (d.success ? setEvents(d.events) : setError(d.error)))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="text-slate-400">←</Link>
        <h1 className="text-xl font-bold">当日履歴</h1>
      </header>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {events === null && !error && <p className="text-slate-400">読込中...</p>}
      {events?.length === 0 && <p className="text-slate-400">本日の打刻はまだありません</p>}

      <ul className="flex flex-col gap-2">
        {events?.map((e) => (
          <li key={e.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{LABEL[e.event_type] ?? e.event_type}</span>
              <span className="text-sm text-slate-500">{hhmm(e.occurred_at)}</span>
            </div>
            {e.vehicle_no && <div className="text-xs text-slate-400">車番 {e.vehicle_no}</div>}
            {e.address && <div className="truncate text-xs text-slate-400">📍 {e.address}</div>}
            {(e.event_items ?? []).map((it, i) => (
              <div key={i} className="mt-1 text-xs text-slate-600">
                {[it.shipper, it.delivery_spot, it.quantity, it.weight, it.cargo_type, it.receipts]
                  .filter(Boolean)
                  .join(" / ")}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
