"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LFDriver, LFJob } from "@/lib/operations/logiflow";

function addDayStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mdw(dateStr: string): { text: string; cls: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const wi = d.getUTCDay();
  const w = ["日", "月", "火", "水", "木", "金", "土"][wi];
  const cls = wi === 6 ? "text-blue-600" : wi === 0 ? "text-red-600" : "text-slate-700";
  return { text: `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${w})`, cls };
}

type ColKind = "am" | "flow" | "next";

export function LogiFlowBoard({
  date,
  drivers,
  totalJobs,
  prevDate,
  nextDate,
}: {
  date: string;
  drivers: LFDriver[];
  totalJobs: number;
  prevDate: string;
  nextDate: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; driverKey: string; col: ColKind } | null>(null);
  const [modal, setModal] = useState<LFJob | null>(null);
  const [live, setLive] = useState(false);
  const tomorrow = addDayStr(date, 1);

  // 即時反映（Realtime＋ポーリング）
  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel("logiflow")
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_plans" }, () => router.refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const iv = setInterval(() => router.refresh(), 25000);
    return () => {
      sb.removeChannel(ch);
      clearInterval(iv);
    };
  }, [router]);

  async function api(path: string, method: string, body?: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "失敗しました");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (id: string, field: string, value: string | number | null) =>
    api(`/api/admin/dispatch-plans/${id}`, "PATCH", { [field]: value });
  const del = (id: string) => {
    if (confirm("この案件を削除しますか？")) api(`/api/admin/dispatch-plans/${id}`, "DELETE");
  };
  const addJob = (driverName: string) =>
    api("/api/admin/dispatch-plans", "POST", { driver_name_raw: driverName, plan_date: date, arrival_date: date });

  // ドロップ: 別列(flow↔next)なら着荷日を変更、同列なら並び替え
  function onDropTo(driver: LFDriver, col: ColKind, beforeId: string | null) {
    if (!drag || drag.driverKey !== driver.key) {
      setDrag(null);
      return;
    }
    if (drag.col !== col) {
      // 列移動: flow=当日, next=翌日
      if (col === "next") patch(drag.id, "arrival_date", tomorrow);
      else if (col === "flow") patch(drag.id, "arrival_date", date);
      setDrag(null);
      return;
    }
    // 同列 並び替え
    const list = col === "flow" ? driver.jobs : col === "next" ? driver.nextDayJobs : driver.amJobs;
    const ids = list.map((j) => j.id).filter((id) => id !== drag.id);
    const at = beforeId ? ids.indexOf(beforeId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, drag.id);
    const reorder = ids.map((id, i) => ({ id, sort_no: i + 1 }));
    setDrag(null);
    api("/api/admin/dispatch-plans", "PATCH", { reorder });
  }

  return (
    <main className="min-h-dvh bg-slate-100 p-3">
      <style>{`@media print { nav{display:none!important;} .no-print{display:none!important;} @page{size:A4 landscape;margin:6mm;} main{padding:0!important;background:#fff!important;} }`}</style>

      <div className="mb-2 flex flex-wrap items-center gap-3 no-print">
        <div>
          <span className="text-xl font-black tracking-widest">LOGI-FLOW NAVI</span>
          <span className="ml-2 text-[10px] font-bold text-slate-400">Operations Management v1</span>
        </div>
        <Link href={`/admin/logiflow?date=${prevDate}`} className="rounded-lg border-2 border-slate-900 bg-white px-3 py-1 text-lg font-bold">◀</Link>
        <form method="GET" className="flex items-center gap-1">
          <input type="date" name="date" defaultValue={date} className="rounded-lg border-2 border-slate-900 px-2 py-1 text-sm font-bold" />
          <button className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-bold text-white">表示</button>
        </form>
        <Link href={`/admin/logiflow?date=${nextDate}`} className="rounded-lg border-2 border-slate-900 bg-white px-3 py-1 text-lg font-bold">▶</Link>
        <span className="rounded-full bg-orange-500 px-3 py-1 text-sm font-black text-white">配車数 {totalJobs}</span>
        <span className={`inline-flex items-center gap-1 text-xs ${live ? "text-green-600" : "text-slate-400"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} /> 自動反映
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin" className="text-sm text-blue-600">← 管理</Link>
          <button onClick={() => window.print()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">🖨️ A4印刷</button>
        </div>
      </div>
      {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600 no-print">{err}</p>}

      <div className="overflow-x-auto rounded-lg border-2 border-black bg-white">
        {/* ヘッダ */}
        <div className="grid min-w-[1100px] grid-cols-[130px_130px_1fr_200px] border-b-2 border-black bg-black text-center text-[10px] font-bold text-white">
          <div className="border-r border-slate-600 p-2">DRIVER</div>
          <div className="border-r border-slate-600 p-2">AM（前日継続）</div>
          <div className="border-r border-slate-600 p-2">当日フロー（{mdw(date).text}）</div>
          <div className="p-2">翌日</div>
        </div>

        {drivers.length === 0 ? (
          <p className="p-10 text-center text-slate-400">{date} の配車はありません</p>
        ) : (
          drivers.map((d) => (
            <div key={d.key} className="grid min-w-[1100px] grid-cols-[130px_130px_1fr_200px] border-b-2 border-black">
              {/* ドライバー情報 */}
              <div className="flex flex-col items-center justify-center border-r-2 border-black bg-slate-50 p-1 text-center">
                <span className="text-[8px] text-slate-400">{d.belong}</span>
                <span className="text-sm font-bold leading-tight">{d.name}</span>
                <span className="mt-1 inline-block border border-black px-1 text-[10px] font-bold">{d.vehicle ?? "--"}</span>
                <button onClick={() => addJob(d.name)} disabled={busy} className="mt-1 rounded border border-black px-1.5 text-[8px] font-bold no-print">＋案件</button>
              </div>
              {/* AM */}
              <Column driver={d} col="am" jobs={d.amJobs} date={date} drag={drag} setDrag={setDrag} onDropTo={onDropTo} patch={patch} del={del} openModal={setModal} placeholder="昭栄車庫" dashed />
              {/* 当日フロー */}
              <Column driver={d} col="flow" jobs={d.jobs} date={date} drag={drag} setDrag={setDrag} onDropTo={onDropTo} patch={patch} del={del} openModal={setModal} placeholder="—" grow />
              {/* 翌日 */}
              <Column driver={d} col="next" jobs={d.nextDayJobs} date={date} drag={drag} setDrag={setDrag} onDropTo={onDropTo} patch={patch} del={del} openModal={setModal} placeholder="翌日なし" nextBg dashed />
            </div>
          ))
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400 no-print">
        案件をドラッグで並び替え／「翌日」列へドラッグで翌日送り（着荷日変更）。積地・着地・到着時間・高速はその場で編集。タップで詳細。
      </p>

      {modal && (
        <JobModal job={modal} date={date} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh(); }} setErr={setErr} />
      )}
    </main>
  );
}

function Column({
  driver, col, jobs, date, drag, setDrag, onDropTo, patch, del, openModal, placeholder, grow, dashed, nextBg,
}: {
  driver: LFDriver; col: ColKind; jobs: LFJob[]; date: string;
  drag: { id: string; driverKey: string; col: ColKind } | null;
  setDrag: (v: { id: string; driverKey: string; col: ColKind } | null) => void;
  onDropTo: (d: LFDriver, col: ColKind, beforeId: string | null) => void;
  patch: (id: string, field: string, value: string) => void;
  del: (id: string) => void; openModal: (j: LFJob) => void;
  placeholder: string; grow?: boolean; dashed?: boolean; nextBg?: boolean;
}) {
  const active = drag && drag.driverKey === driver.key;
  return (
    <div
      className={`flex items-center gap-1 overflow-x-auto border-r border-black p-1 ${grow ? "" : ""} ${nextBg ? "bg-slate-100" : ""} ${active ? "outline-dashed outline-2 outline-blue-400" : ""}`}
      onDragOver={(e) => { if (active) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDropTo(driver, col, null); }}
    >
      {jobs.length === 0 ? (
        <div className={`flex h-[92px] w-[150px] flex-col items-center justify-center rounded border-2 ${dashed ? "border-dashed" : "border-solid"} border-slate-300 text-[10px] font-bold text-slate-400`}>{placeholder}</div>
      ) : (
        jobs.map((j) => (
          <JobBox key={j.id} job={j} driverVehicle={driver.vehicle} col={col}
            onDragStart={() => setDrag({ id: j.id, driverKey: driver.key, col })}
            onDropBefore={() => onDropTo(driver, col, j.id)}
            patch={patch} del={del} openModal={openModal} />
        ))
      )}
    </div>
  );
}

function JobBox({
  job, driverVehicle, col, onDragStart, onDropBefore, patch, del, openModal,
}: {
  job: LFJob; driverVehicle: string | null; col: ColKind;
  onDragStart: () => void; onDropBefore: () => void;
  patch: (id: string, field: string, value: string) => void; del: (id: string) => void; openModal: (j: LFJob) => void;
}) {
  const diff = (job.vehicleNo ?? "").trim() !== "" && (job.vehicleNo ?? "").trim() !== (driverVehicle ?? "").trim();
  const w = col === "am" ? "w-[115px]" : col === "next" ? "w-[150px]" : "w-[180px]";
  const dt = mdw(job.arrivalDate);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); e.preventDefault(); onDropBefore(); }}
      className={`relative flex h-[92px] ${w} shrink-0 cursor-grab flex-col justify-between rounded border ${diff ? "border-[2.5px] border-black bg-slate-100" : "border-black bg-white"} p-1`}
    >
      <span onClick={() => del(job.id)} className="absolute right-0.5 top-0 cursor-pointer text-xs text-slate-300 hover:text-red-500 no-print">×</span>
      <div className="flex items-center justify-between text-[7px]" onClick={() => openModal(job)}>
        <span className={`font-bold ${dt.cls}`}>{dt.text}</span>
        {diff && <span className="text-red-600">!車:{job.vehicleNo}</span>}
      </div>
      <div className="flex flex-1 items-start justify-between gap-0.5">
        <textarea defaultValue={job.originSpot ?? ""} onBlur={(e) => patch(job.id, "origin_spot", e.target.value)}
          className="h-8 w-[46%] resize-none break-all border-none bg-transparent p-0 text-[9px] font-bold leading-tight focus:bg-yellow-50 focus:outline focus:outline-1" />
        <span className="mt-1 text-[7px] font-bold">→</span>
        <textarea defaultValue={job.destSpot ?? ""} onBlur={(e) => patch(job.id, "delivery_spot", e.target.value)}
          className="h-8 w-[46%] resize-none break-all border-none bg-transparent p-0 text-[9px] font-bold leading-tight focus:bg-yellow-50 focus:outline focus:outline-1" />
      </div>
      <div>
        <input defaultValue={job.arrivalTime ?? ""} placeholder="到着指定" onBlur={(e) => patch(job.id, "arrival_time", e.target.value)}
          className="w-full border-none border-t border-black bg-blue-50 p-0 text-center text-[8px] font-bold focus:outline focus:outline-1" />
        <input defaultValue={job.express ?? ""} placeholder="高速指示" onBlur={(e) => patch(job.id, "highway_instruction", e.target.value)}
          className="w-full border-none border-t border-black bg-yellow-50 p-0 text-center text-[8px] font-bold focus:outline focus:outline-1" />
      </div>
    </div>
  );
}

function JobModal({
  job, date, onClose, onSaved, setErr,
}: {
  job: LFJob; date: string; onClose: () => void; onSaved: () => void; setErr: (s: string | null) => void;
}) {
  const [f, setF] = useState({
    vehicle_no: job.vehicleNo ?? "",
    plan_date: job.planDate || date,
    arrival_date: job.arrivalDate || date,
    shipper: job.shipper ?? "",
    origin_spot: job.originSpot === "新規積地" ? "" : job.originSpot ?? "",
    delivery_spot: job.destSpot === "新規着地" ? "" : job.destSpot ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/dispatch-plans/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, k: keyof typeof f, type = "text") => (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1.5">
      <span className="w-20 text-sm font-bold text-slate-600">{label}</span>
      <input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border-2 border-black bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 border-b-2 border-black pb-2 text-base font-bold">📝 案件詳細</h3>
        {row("車両NO", "vehicle_no")}
        {row("積込日", "plan_date", "date")}
        {row("着荷日", "arrival_date", "date")}
        {row("荷主名", "shipper")}
        {row("積地", "origin_spot")}
        {row("着荷地", "delivery_spot")}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-slate-500 px-4 py-1.5 font-bold text-white">キャンセル</button>
          <button onClick={save} disabled={saving} className="rounded bg-orange-500 px-5 py-1.5 font-bold text-white disabled:opacity-50">
            {saving ? "保存中…" : "保存して閉じる"}
          </button>
        </div>
      </div>
    </div>
  );
}
