"use client";

import { useEffect, useState } from "react";

interface Driver {
  id: string;
  code: string;
  name: string;
  default_vehicle_no: string | null;
}

/**
 * 据置端末（事務所共用 / S-08, S-09）。
 * 端末トークンで解錠 → ドライバー選択 → 出庫/退勤 のみ代行打刻。
 */
export function OfficeTerminal() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("office_token");
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/office/drivers", { headers: { "x-office-token": token } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDrivers(d.drivers);
        else {
          setError(d.error ?? "取得失敗");
          localStorage.removeItem("office_token");
          setToken(null);
        }
      })
      .catch((e) => setError(String(e)));
  }, [token]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("office_token", tokenInput);
    setToken(tokenInput);
    setError(null);
  }

  async function punch(eventType: "departure" | "clock_out") {
    if (!selected || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/office/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-office-token": token },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          driver_id: selected.id,
          event_type: eventType,
          vehicle_no: vehicle || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setToast(`${selected.name}: ${eventType === "departure" ? "出庫" : "退勤"} を記録しました`);
      setSelected(null);
      setVehicle("");
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">据置端末 解錠</h1>
        <form onSubmit={unlock} className="flex flex-col gap-3">
          <input type="password" placeholder="端末トークン" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">解錠</button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">据置端末 — 出退勤</h1>
        <button onClick={() => { localStorage.removeItem("office_token"); setToken(null); }} className="text-sm text-slate-400">ロック</button>
      </header>

      {toast && <p className="mb-3 rounded bg-green-100 p-3 text-center font-medium text-green-800">{toast}</p>}
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      {drivers === null ? (
        <p className="text-slate-400">読込中...</p>
      ) : !selected ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => { setSelected(d); setVehicle(d.default_vehicle_no ?? ""); }}
              className="rounded-xl border border-slate-300 px-3 py-5 text-center active:bg-slate-100"
            >
              <div className="text-xs text-slate-400">{d.code}</div>
              <div className="font-medium">{d.name}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-sm rounded-xl border border-slate-300 p-5">
          <div className="mb-1 text-sm text-slate-400">{selected.code}</div>
          <div className="mb-4 text-2xl font-bold">{selected.name}</div>
          <label className="mb-4 block">
            <span className="text-sm text-slate-600">車番</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex gap-3">
            <button onClick={() => punch("departure")} disabled={busy} className="flex-1 rounded-xl bg-slate-900 px-4 py-4 text-lg font-bold text-white disabled:opacity-50">出庫</button>
            <button onClick={() => punch("clock_out")} disabled={busy} className="flex-1 rounded-xl bg-orange-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-50">退勤</button>
          </div>
          <button onClick={() => setSelected(null)} className="mt-4 w-full text-sm text-slate-400">← 戻る</button>
        </div>
      )}
    </main>
  );
}
