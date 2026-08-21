"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 配車表 1行ぶんのデータ（dispatch_plans を画面用に平坦化）。 */
export interface DispatchRow {
  id: string;
  driver_name_raw: string | null;
  driver_name: string | null; // drivers 紐付け名（あれば優先表示）
  vehicle_no: string | null;
  shipper: string | null;
  origin_spot: string | null;
  delivery_spot: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  is_subcontract: boolean;
}

/**
 * 配車表（/admin/dispatch）の編集可能テーブル。
 *   列＝荷主名 / 積地 / 着地 / 着日 / 時間 / 車番 / 所属 / 担当者。
 *   編集は dispatch_plans に直接書き込むため、流れ表(/admin/logiflow)にも即反映される。
 */
export function DispatchTable({ date, rows }: { date: string; rows: DispatchRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const editingRef = useRef(false);
  editingRef.current = editing;

  // DBの変更を自動反映（編集中はポーリング停止で入力を保護）
  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel("dispatch-plans-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_plans" }, () => {
        if (!editingRef.current) router.refresh();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const iv = setInterval(() => {
      if (!editingRef.current) router.refresh();
    }, 20000);
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
      if (!d.success) throw new Error(d.error ?? "保存に失敗しました");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (id: string, field: string, value: string | boolean | null) =>
    api(`/api/admin/dispatch-plans/${id}`, "PATCH", { [field]: value });
  const del = (id: string) => {
    if (confirm("この配車行を削除しますか？")) api(`/api/admin/dispatch-plans/${id}`, "DELETE");
  };
  const add = (sub: boolean) =>
    api("/api/admin/dispatch-plans", "POST", {
      driver_name_raw: "（新規ドライバー）",
      plan_date: date,
      arrival_date: date,
      is_subcontract: sub,
    });

  const own = rows.filter((r) => !r.is_subcontract).length;
  const sub = rows.length - own;

  const cell =
    "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline focus:outline-1 focus:outline-emerald-500";

  return (
    <div className="print:overflow-visible">
      {/* 操作バー */}
      <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
        <button
          onClick={() => setEditing((v) => !v)}
          className={`rounded-xl px-5 py-2.5 text-base font-black shadow transition ${
            editing ? "bg-green-600 text-white" : "border-2 border-orange-500 bg-white text-orange-600"
          }`}
        >
          {editing ? "✅ 編集を終了" : "✏️ 編集"}
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} />
          {live ? "自動反映中（即時）" : "自動更新中"}
        </span>
        {busy && <span className="text-xs font-bold text-emerald-600">保存中…</span>}
        {editing && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => add(false)} disabled={busy} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">＋ 自社を追加</button>
            <button onClick={() => add(true)} disabled={busy} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">＋ 子車を追加</button>
          </div>
        )}
      </div>

      {editing && (
        <p className="mb-3 rounded-lg border-2 border-green-500 bg-green-50 p-2 text-sm font-bold text-green-800 print:hidden">
          ✏️ 編集モード：各セルをその場で修正（入力欄から離れると保存）。所属バッジで自社／子車を切替、×で行削除。
          ここでの修正は<strong>流れ表にも反映</strong>されます。
        </p>
      )}
      {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600 print:hidden">{err}</p>}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-slate-400">
          {date} の配車データがありません
          {editing && <span className="mt-2 block text-sm">上の「＋ 自社を追加 / ＋ 子車を追加」で行を作成できます。</span>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border print:overflow-visible print:border-0">
          <table className="w-full text-sm print:text-[10px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2 whitespace-nowrap">荷主名</th>
                <th className="p-2 whitespace-nowrap">積地</th>
                <th className="p-2 whitespace-nowrap">着地</th>
                <th className="p-2 whitespace-nowrap">着日</th>
                <th className="p-2 whitespace-nowrap">時間</th>
                <th className="p-2 whitespace-nowrap">車番</th>
                <th className="p-2 whitespace-nowrap">所属</th>
                <th className="p-2 whitespace-nowrap">担当者</th>
                {editing && <th className="p-2 print:hidden"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  {/* 荷主名 */}
                  <td className="p-3 whitespace-nowrap">
                    {editing ? (
                      <input defaultValue={r.shipper ?? ""} onBlur={(e) => patch(r.id, "shipper", e.target.value)} className={`${cell} min-w-[8rem]`} />
                    ) : (
                      (r.shipper ?? "—")
                    )}
                  </td>
                  {/* 積地 */}
                  <td className="p-3">
                    {editing ? (
                      <input defaultValue={r.origin_spot ?? ""} onBlur={(e) => patch(r.id, "origin_spot", e.target.value)} className={`${cell} min-w-[10rem]`} />
                    ) : (
                      (r.origin_spot ?? "—")
                    )}
                  </td>
                  {/* 着地 */}
                  <td className="p-3">
                    {editing ? (
                      <input defaultValue={r.delivery_spot ?? ""} onBlur={(e) => patch(r.id, "delivery_spot", e.target.value)} className={`${cell} min-w-[10rem]`} />
                    ) : (
                      (r.delivery_spot ?? "—")
                    )}
                  </td>
                  {/* 着日 */}
                  <td className="p-3 whitespace-nowrap">
                    {editing ? (
                      <input type="date" defaultValue={r.arrival_date ?? ""} onBlur={(e) => patch(r.id, "arrival_date", e.target.value || null)} className={`${cell} w-36`} />
                    ) : (
                      (r.arrival_date ?? "—")
                    )}
                  </td>
                  {/* 時間 */}
                  <td className="p-3 whitespace-nowrap">
                    {editing ? (
                      <input defaultValue={r.arrival_time ?? ""} placeholder="8:00" onBlur={(e) => patch(r.id, "arrival_time", e.target.value)} className={`${cell} w-24`} />
                    ) : (
                      (r.arrival_time ?? "—")
                    )}
                  </td>
                  {/* 車番 */}
                  <td className="p-3 whitespace-nowrap">
                    {editing ? (
                      <input defaultValue={r.vehicle_no ?? ""} onBlur={(e) => patch(r.id, "vehicle_no", e.target.value)} className={`${cell} w-24`} />
                    ) : (
                      (r.vehicle_no ?? "—")
                    )}
                  </td>
                  {/* 所属 */}
                  <td className="p-3 whitespace-nowrap">
                    {editing ? (
                      <button
                        onClick={() => patch(r.id, "is_subcontract", !r.is_subcontract)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold ${r.is_subcontract ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}
                        title="クリックで自社／子車を切替"
                      >
                        {r.is_subcontract ? "🚚 子車" : "🏢 自社"}
                      </button>
                    ) : (
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold ${r.is_subcontract ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}>
                        {r.is_subcontract ? "🚚 子車" : "🏢 自社"}
                      </span>
                    )}
                  </td>
                  {/* 担当者 */}
                  <td className="p-3 whitespace-nowrap font-bold">
                    {editing ? (
                      <input defaultValue={r.driver_name_raw ?? r.driver_name ?? ""} onBlur={(e) => patch(r.id, "driver_name_raw", e.target.value)} className={`${cell} min-w-[8rem]`} />
                    ) : (
                      (r.driver_name ?? r.driver_name_raw ?? "—")
                    )}
                  </td>
                  {/* 削除 */}
                  {editing && (
                    <td className="p-3 print:hidden">
                      <button onClick={() => del(r.id)} disabled={busy} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">× 削除</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400 print:hidden">
        全{rows.length}件（自社{own} / 子車{sub}）
        {editing ? "　編集内容は流れ表にも反映されます。" : "　編集するには右上の「✏️ 編集」を押してください。"}
      </p>
    </div>
  );
}
