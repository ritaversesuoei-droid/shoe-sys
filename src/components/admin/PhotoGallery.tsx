"use client";

import { useState } from "react";
import type { PhotoDay } from "@/lib/operations/photo-gallery";

const LABEL: Record<string, string> = {
  departure: "出勤",
  leg_departure: "長距離再出発",
  arrival: "到着",
  loading: "積込",
  unloading: "荷卸",
  long_rest: "長距離休憩",
  clock_out: "退勤",
  rest_start: "休憩開始",
  rest_end: "休憩終了",
};

function mdw(day: string): string {
  const d = new Date(`${day}T00:00:00+09:00`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${day.slice(5, 7)}/${day.slice(8, 10)}（${w}）`;
}

/** 写真ギャラリー（日ごと・タップで拡大）。 */
export function PhotoGallery({ days }: { days: PhotoDay[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!days.length) {
    return <p className="rounded-xl border border-dashed p-10 text-center text-slate-400">この条件の写真はありません</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((d) => (
        <section key={d.day}>
          <h2 className="mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-1">
            <span className="text-lg font-bold text-slate-800">{mdw(d.day)}</span>
            <span className="text-sm text-slate-400">{d.count}枚</span>
          </h2>
          <div className="flex flex-col gap-3">
            {d.entries.map((e) => (
              <div key={e.eventId} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{LABEL[e.type] ?? e.type}</span>
                  <span className="font-mono text-slate-500">{e.time}</span>
                  <span className="font-medium text-slate-700">{e.driverName}</span>
                  {e.driverCode && <span className="text-xs text-slate-400">{e.driverCode}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.urls.map((url, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(url)} className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${e.driverName} ${e.time}`} className="h-24 w-24 rounded-lg border border-slate-300 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="拡大" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
