"use client";

import { useCallback, useEffect, useState } from "react";

interface Driver {
  id: string;
  code: string;
  name: string;
  default_vehicle_no: string | null;
  affiliation: string | null;
  phone: string | null;
  is_active: boolean;
  manage_attendance: boolean;
}
interface Vehicle {
  id: string;
  vehicle_no: string;
  name: string | null;
  kind: string | null;
  is_active: boolean;
  registered_on: string | null;
  inspection_expiry: string | null;
  note: string | null;
}
interface Customer {
  id: string;
  name: string;
  yago: string | null;
  postal_code: string | null;
  address: string | null;
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? "失敗しました");
  return data;
}

export function MasterManager() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nd, setNd] = useState({ code: "", name: "", default_vehicle_no: "", affiliation: "", phone: "" });
  const [nv, setNv] = useState({ vehicle_no: "", name: "", kind: "", registered_on: "", inspection_expiry: "" });
  const [nc, setNc] = useState({ name: "", yago: "", address: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, v, c] = await Promise.all([
        api("/api/admin/drivers", "GET"),
        api("/api/admin/vehicles", "GET"),
        api("/api/admin/customers", "GET"),
      ]);
      setDrivers(d.drivers);
      setVehicles(v.vehicles);
      setCustomers(c.customers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      {/* ドライバー */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">ドライバーマスタ（{drivers.length}）</h2>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
          <input placeholder="業務ID*" value={nd.code} onChange={(e) => setNd({ ...nd, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="氏名*" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="携帯番号" value={nd.phone} onChange={(e) => setNd({ ...nd, phone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="既定車番" value={nd.default_vehicle_no} onChange={(e) => setNd({ ...nd, default_vehicle_no: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="所属" value={nd.affiliation} onChange={(e) => setNd({ ...nd, affiliation: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <button
            onClick={() => run(async () => {
              await api("/api/admin/drivers", "POST", {
                code: nd.code, name: nd.name,
                default_vehicle_no: nd.default_vehicle_no || undefined,
                affiliation: nd.affiliation || undefined,
                phone: nd.phone || undefined,
              });
              setNd({ code: "", name: "", default_vehicle_no: "", affiliation: "", phone: "" });
            })}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-base font-bold text-white"
          >
            追加
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-2">ID</th><th className="p-2">氏名</th><th className="p-2">携帯番号</th><th className="p-2">既定車番</th><th className="p-2">所属</th><th className="p-2">勤怠管理</th><th className="p-2">在籍</th></tr></thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className={`border-t ${d.is_active ? "" : "opacity-50"}`}>
                  <td className="p-2">{d.code}</td>
                  <td className="p-2">{d.name}</td>
                  <td className="p-2">
                    <input
                      defaultValue={d.phone ?? ""}
                      placeholder="携帯番号"
                      onBlur={(e) => e.target.value !== (d.phone ?? "") && run(() => api(`/api/admin/drivers/${d.id}`, "PATCH", { phone: e.target.value || null }))}
                      className="w-36 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-2">{d.default_vehicle_no ?? "-"}</td>
                  <td className="p-2">{d.affiliation ?? "-"}</td>
                  <td className="p-2">
                    <button onClick={() => run(() => api(`/api/admin/drivers/${d.id}`, "PATCH", { manage_attendance: !d.manage_attendance }))}
                      title="自社=勤怠管理あり / 協力店社=打刻履歴のみ・違反判定なし"
                      className={`rounded-full px-2 py-0.5 text-xs ${d.manage_attendance ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                      {d.manage_attendance ? "自社" : "協力"}
                    </button>
                  </td>
                  <td className="p-2">
                    <button onClick={() => run(() => api(`/api/admin/drivers/${d.id}`, "PATCH", { is_active: !d.is_active }))}
                      className={`rounded-full px-2 py-0.5 text-xs ${d.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                      {d.is_active ? "在籍" : "退職"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 車両 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">車両マスタ（{vehicles.length}）</h2>
        <p className="mb-2 text-xs text-slate-500">全車両を登録できます。区分（車種）・登録日・車検満了日は各行でその場編集（入力欄から離れると保存）。区分は流れ表の並び順（大型→4t→トレ…）に使われます。</p>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
          <input placeholder="車番*" value={nv.vehicle_no} onChange={(e) => setNv({ ...nv, vehicle_no: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="通称" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="区分(大型/4t/トレ 等)" value={nv.kind} onChange={(e) => setNv({ ...nv, kind: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <label className="flex flex-col text-[10px] text-slate-400">登録日<input type="date" value={nv.registered_on} onChange={(e) => setNv({ ...nv, registered_on: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
          <label className="flex flex-col text-[10px] text-slate-400">車検満了<input type="date" value={nv.inspection_expiry} onChange={(e) => setNv({ ...nv, inspection_expiry: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
          <button
            onClick={() => run(async () => {
              await api("/api/admin/vehicles", "POST", {
                vehicle_no: nv.vehicle_no,
                name: nv.name || undefined,
                kind: nv.kind || undefined,
                registered_on: nv.registered_on || undefined,
                inspection_expiry: nv.inspection_expiry || undefined,
              });
              setNv({ vehicle_no: "", name: "", kind: "", registered_on: "", inspection_expiry: "" });
            })}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-base font-bold text-white"
          >
            追加
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-2">車番</th><th className="p-2">通称</th><th className="p-2">区分(車種)</th><th className="p-2">登録日</th><th className="p-2">車検満了</th><th className="p-2">稼働</th></tr></thead>
            <tbody>
              {vehicles.map((v) => {
                const vp = (field: string, value: string | null) => run(() => api(`/api/admin/vehicles/${v.id}`, "PATCH", { [field]: value || null }));
                const cell = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
                return (
                  <tr key={v.id} className={`border-t align-top ${v.is_active ? "" : "opacity-50"}`}>
                    <td className="p-2 whitespace-nowrap font-bold">{v.vehicle_no}</td>
                    <td className="p-2"><input defaultValue={v.name ?? ""} placeholder="通称" onBlur={(e) => e.target.value !== (v.name ?? "") && vp("name", e.target.value)} className={`${cell} min-w-[6rem]`} /></td>
                    <td className="p-2"><input defaultValue={v.kind ?? ""} placeholder="大型/4t/トレ" onBlur={(e) => e.target.value !== (v.kind ?? "") && vp("kind", e.target.value)} className={`${cell} w-24`} /></td>
                    <td className="p-2"><input type="date" defaultValue={v.registered_on ?? ""} onBlur={(e) => e.target.value !== (v.registered_on ?? "") && vp("registered_on", e.target.value)} className={`${cell} w-36`} /></td>
                    <td className="p-2"><input type="date" defaultValue={v.inspection_expiry ?? ""} onBlur={(e) => e.target.value !== (v.inspection_expiry ?? "") && vp("inspection_expiry", e.target.value)} className={`${cell} w-36`} /></td>
                    <td className="p-2">
                      <button onClick={() => run(() => api(`/api/admin/vehicles/${v.id}`, "PATCH", { is_active: !v.is_active }))}
                        className={`rounded-full px-2 py-0.5 text-xs ${v.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {v.is_active ? "稼働" : "停止"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 客先（荷主） */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">客先マスタ（{customers.length}）</h2>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
          <input placeholder="客先名*" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="屋号(照合キー)" value={nc.yago} onChange={(e) => setNc({ ...nc, yago: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <input placeholder="住所" value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          <button
            onClick={() => run(async () => {
              await api("/api/admin/customers", "POST", { name: nc.name, yago: nc.yago || undefined, address: nc.address || undefined });
              setNc({ name: "", yago: "", address: "" });
            })}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-base font-bold text-white"
          >
            追加
          </button>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left"><tr><th className="p-2">客先名</th><th className="p-2">屋号</th><th className="p-2">住所</th><th className="p-2"></th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2 text-slate-500">{c.yago ?? "-"}</td>
                  <td className="p-2 text-slate-500">{c.address ?? "-"}</td>
                  <td className="p-2">
                    <button onClick={() => { if (confirm(`「${c.name}」を削除しますか？`)) void run(() => api(`/api/admin/customers/${c.id}`, "DELETE")); }}
                      className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
