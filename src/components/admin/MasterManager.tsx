"use client";

import { useCallback, useEffect, useState } from "react";

interface Driver {
  id: string;
  code: string;
  name: string;
  default_vehicle_no: string | null;
  affiliation: string | null;
  is_active: boolean;
}
interface Vehicle {
  id: string;
  vehicle_no: string;
  name: string | null;
  kind: string | null;
  is_active: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [nd, setNd] = useState({ code: "", name: "", default_vehicle_no: "", affiliation: "" });
  const [nv, setNv] = useState({ vehicle_no: "", name: "", kind: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, v] = await Promise.all([api("/api/admin/drivers", "GET"), api("/api/admin/vehicles", "GET")]);
      setDrivers(d.drivers);
      setVehicles(v.vehicles);
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
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-5">
          <input placeholder="業務ID*" value={nd.code} onChange={(e) => setNd({ ...nd, code: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="氏名*" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="既定車番" value={nd.default_vehicle_no} onChange={(e) => setNd({ ...nd, default_vehicle_no: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="所属" value={nd.affiliation} onChange={(e) => setNd({ ...nd, affiliation: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button
            onClick={() => run(async () => {
              await api("/api/admin/drivers", "POST", {
                code: nd.code, name: nd.name,
                default_vehicle_no: nd.default_vehicle_no || undefined,
                affiliation: nd.affiliation || undefined,
              });
              setNd({ code: "", name: "", default_vehicle_no: "", affiliation: "" });
            })}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            追加
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-2">ID</th><th className="p-2">氏名</th><th className="p-2">既定車番</th><th className="p-2">所属</th><th className="p-2">在籍</th></tr></thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className={`border-t ${d.is_active ? "" : "opacity-50"}`}>
                  <td className="p-2">{d.code}</td>
                  <td className="p-2">{d.name}</td>
                  <td className="p-2">{d.default_vehicle_no ?? "-"}</td>
                  <td className="p-2">{d.affiliation ?? "-"}</td>
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
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
          <input placeholder="車番*" value={nv.vehicle_no} onChange={(e) => setNv({ ...nv, vehicle_no: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="通称" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="区分(大型/中型 等)" value={nv.kind} onChange={(e) => setNv({ ...nv, kind: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button
            onClick={() => run(async () => {
              await api("/api/admin/vehicles", "POST", { vehicle_no: nv.vehicle_no, name: nv.name || undefined, kind: nv.kind || undefined });
              setNv({ vehicle_no: "", name: "", kind: "" });
            })}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            追加
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-2">車番</th><th className="p-2">通称</th><th className="p-2">区分</th><th className="p-2">稼働</th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className={`border-t ${v.is_active ? "" : "opacity-50"}`}>
                  <td className="p-2">{v.vehicle_no}</td>
                  <td className="p-2">{v.name ?? "-"}</td>
                  <td className="p-2">{v.kind ?? "-"}</td>
                  <td className="p-2">
                    <button onClick={() => run(() => api(`/api/admin/vehicles/${v.id}`, "PATCH", { is_active: !v.is_active }))}
                      className={`rounded-full px-2 py-0.5 text-xs ${v.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                      {v.is_active ? "稼働" : "停止"}
                    </button>
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
