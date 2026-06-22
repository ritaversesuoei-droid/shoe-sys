"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Leg {
  shipper?: string;
  origin_spot?: string;
  destination_spot?: string;
  cargo?: string;
  receipts?: string;
  extra_work?: string;
  meter?: number | null;
}
interface Rest {
  rest_type: "rest" | "sleep";
  place?: string;
  start_at?: string | null;
  end_at?: string | null;
}

/** ISO(UTC) → datetime-local 値(JST) */
function isoToLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
/** datetime-local 値(JST) → ISO */
function localToIso(local?: string | null): string | undefined {
  if (!local) return undefined;
  return `${local}:00+09:00`;
}

function todayJst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function DailyReportForm() {
  const [date, setDate] = useState(todayJst());
  const [driverId, setDriverId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [vehicleNo, setVehicleNo] = useState("");
  const [crew, setCrew] = useState("");
  const [meterStart, setMeterStart] = useState<string>("");
  const [meterEnd, setMeterEnd] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [rests, setRests] = useState<Rest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "confirmed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setPdfUrl(null);
    try {
      const res = await fetch(`/api/daily-reports?date=${date}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDriverId(data.driverId ?? null);
      const r = data.report;
      if (r) {
        setShiftId(r.shift_id ?? null);
        setStatus(r.status ?? "draft");
        setVehicleNo(r.vehicle_no ?? "");
        setCrew(r.crew ?? "");
        setMeterStart(r.meter_start != null ? String(r.meter_start) : "");
        setMeterEnd(r.meter_end != null ? String(r.meter_end) : "");
        setNotes(r.notes ?? "");
        setLegs(r.legs ?? []);
        setRests(r.rests ?? []);
        if (data.generated) setMessage("打刻から日報を自動生成しました。確認・編集して保存してください。");
      } else {
        setShiftId(null);
        setStatus("draft");
        setVehicleNo("");
        setCrew("");
        setMeterStart("");
        setMeterEnd("");
        setNotes("");
        setLegs([]);
        setRests([]);
        setMessage("対象日の運行データがありません。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(target: "draft" | "confirmed") {
    setSaving(target);
    setError(null);
    setMessage(null);
    try {
      const body = {
        report_date: date,
        status: target,
        shift_id: shiftId ?? undefined,
        vehicle_no: vehicleNo || undefined,
        crew: crew || undefined,
        meter_start: meterStart ? Number(meterStart) : undefined,
        meter_end: meterEnd ? Number(meterEnd) : undefined,
        notes: notes || undefined,
        legs: legs.map((l) => ({ ...l, meter: l.meter != null && l.meter !== ("" as unknown) ? Number(l.meter) : undefined })),
        rests: rests.map((r) => ({
          rest_type: r.rest_type,
          place: r.place || undefined,
          start_at: localToIso(r.start_at),
          end_at: localToIso(r.end_at),
        })),
      };
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStatus(data.report?.status ?? target);
      setMessage(target === "confirmed" ? "日報を確定しました。" : "一時保存しました。");
      if (target === "confirmed") await generatePdf();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function generatePdf() {
    if (!driverId) return;
    try {
      const res = await fetch(`/api/reports/${date}/${driverId}/pdf`, { method: "POST" });
      const data = await res.json();
      if (data.success) setPdfUrl(data.url);
    } catch {
      /* PDFは任意。失敗しても確定は成功 */
    }
  }

  if (loading) return <main className="p-4 text-slate-400">読込中...</main>;

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="text-slate-400">←</Link>
        <h1 className="text-xl font-bold">日報作成</h1>
        {status === "confirmed" && (
          <span className="ml-auto rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">確定済</span>
        )}
      </header>

      <label className="mb-4 block">
        <span className="text-sm text-slate-600">運行日</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </label>

      {message && <p className="mb-3 rounded bg-blue-50 p-2 text-sm text-blue-700">{message}</p>}
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-sm text-slate-600">車番</span>
          <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
        <label className="block"><span className="text-sm text-slate-600">乗務員</span>
          <input value={crew} onChange={(e) => setCrew(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
        <label className="block"><span className="text-sm text-slate-600">開始メーター</span>
          <input type="number" value={meterStart} onChange={(e) => setMeterStart(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
        <label className="block"><span className="text-sm text-slate-600">終了メーター</span>
          <input type="number" value={meterEnd} onChange={(e) => setMeterEnd(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">運行明細</span>
          <button onClick={() => setLegs((p) => [...p, { shipper: "" }])} className="text-sm text-blue-600">＋追加</button>
        </div>
        {legs.map((l, i) => (
          <div key={i} className="mb-2 rounded-lg border border-slate-200 p-2">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="荷主" value={l.shipper ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, shipper: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="物積" value={l.cargo ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, cargo: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="発地" value={l.origin_spot ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, origin_spot: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="着地" value={l.destination_spot ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, destination_spot: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="受領書" value={l.receipts ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, receipts: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="付帯作業" value={l.extra_work ?? ""} onChange={(e) => setLegs((p) => p.map((x, idx) => idx === i ? { ...x, extra_work: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button onClick={() => setLegs((p) => p.filter((_, idx) => idx !== i))} className="mt-1 text-xs text-red-500">削除</button>
          </div>
        ))}
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">休憩・睡眠（合計90分以上で確定可）</span>
          <button onClick={() => setRests((p) => [...p, { rest_type: "rest" }])} className="text-sm text-blue-600">＋追加</button>
        </div>
        {rests.map((r, i) => (
          <div key={i} className="mb-2 rounded-lg border border-slate-200 p-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={r.rest_type} onChange={(e) => setRests((p) => p.map((x, idx) => idx === i ? { ...x, rest_type: e.target.value as "rest" | "sleep" } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm">
                <option value="rest">休憩</option>
                <option value="sleep">睡眠</option>
              </select>
              <input placeholder="場所" value={r.place ?? ""} onChange={(e) => setRests((p) => p.map((x, idx) => idx === i ? { ...x, place: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input type="datetime-local" value={isoToLocal(r.start_at)} onChange={(e) => setRests((p) => p.map((x, idx) => idx === i ? { ...x, start_at: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input type="datetime-local" value={isoToLocal(r.end_at)} onChange={(e) => setRests((p) => p.map((x, idx) => idx === i ? { ...x, end_at: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button onClick={() => setRests((p) => p.filter((_, idx) => idx !== i))} className="mt-1 text-xs text-red-500">削除</button>
          </div>
        ))}
      </section>

      <label className="mt-5 block"><span className="text-sm text-slate-600">特記</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>

      {pdfUrl && (
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-lg border border-slate-900 px-4 py-3 text-center font-medium">
          日報PDFを開く
        </a>
      )}

      <div className="mt-6 flex gap-3">
        <button onClick={() => save("draft")} disabled={saving !== null} className="flex-1 rounded-xl border border-slate-900 px-4 py-3 font-medium disabled:opacity-50">
          {saving === "draft" ? "保存中..." : "一時保存"}
        </button>
        <button onClick={() => save("confirmed")} disabled={saving !== null} className="flex-1 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white disabled:opacity-50">
          {saving === "confirmed" ? "確定中..." : "確定"}
        </button>
      </div>
    </main>
  );
}
