"use client";

import { useState } from "react";
import ReportPdfButton from "./ReportPdfButton";

/** 日付＋ドライバーを選んで日報PDF（印刷用日報）を表示する。 */
export default function ReportPicker({
  drivers,
  defaultDate,
}: {
  drivers: { id: string; code: string; name: string }[];
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [driver, setDriver] = useState(drivers[0]?.id ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
      <label className="text-xs text-slate-500">
        日付
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-1 block rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-500">
        ドライバー
        <select value={driver} onChange={(e) => setDriver(e.target.value)} className="ml-1 block rounded border border-slate-300 px-2 py-1.5 text-sm">
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.code} {d.name}</option>
          ))}
        </select>
      </label>
      <ReportPdfButton date={date} driverId={driver} />
    </div>
  );
}
