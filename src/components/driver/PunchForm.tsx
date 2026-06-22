"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EventType =
  | "departure"
  | "leg_departure"
  | "arrival"
  | "loading"
  | "unloading"
  | "long_rest"
  | "clock_out";

const CONFIG: Record<EventType, { label: string; items: "load" | "unload" | null; alcohol: boolean }> = {
  departure: { label: "出発", items: null, alcohol: false },
  leg_departure: { label: "各駅出発", items: null, alcohol: true },
  arrival: { label: "到着報告", items: null, alcohol: false },
  loading: { label: "積込完了", items: "load", alcohol: false },
  unloading: { label: "荷卸完了", items: "unload", alcohol: false },
  long_rest: { label: "長距離休憩", items: null, alcohol: true },
  clock_out: { label: "退勤", items: null, alcohol: false },
};

interface Item {
  shipper?: string;
  delivery_spot?: string;
  quantity?: string;
  weight?: string;
  slip_no?: string;
  cargo_type?: string;
  receipts?: string;
}

export function PunchForm({ type }: { type: EventType }) {
  const cfg = CONFIG[type];
  const [vehicleNo, setVehicleNo] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "ok" | "error">("idle");
  const [alcohol, setAlcohol] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>(cfg.items ? [{}] : []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // 既定車番の復元 + 位置情報の取得
  useEffect(() => {
    const saved = localStorage.getItem("shoei_vehicle_no");
    if (saved) setVehicleNo(saved);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
          setGeoState("ok");
        },
        () => setGeoState("error"),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, []);

  function updateItem(i: number, patch: Item) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (cfg.alcohol && !alcohol) throw new Error("アルコールチェックの確認が必要です");
      if (vehicleNo) localStorage.setItem("shoei_vehicle_no", vehicleNo);

      const cleanItems = items
        .map((it) => Object.fromEntries(Object.entries(it).filter(([, v]) => v)))
        .filter((it) => Object.keys(it).length > 0);

      const body = {
        idempotency_key: crypto.randomUUID(),
        event_type: type,
        occurred_at: new Date().toISOString(),
        vehicle_no: vehicleNo || undefined,
        address: address || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        alcohol_checked: cfg.alcohol ? alcohol : undefined,
        note: note || undefined,
        items: cleanItems.length ? cleanItems : undefined,
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "送信に失敗しました");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const judgement = result.judgement as { alertTypes?: string[]; hasViolation?: boolean } | undefined;
    return (
      <main className="mx-auto max-w-md p-4">
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <div className="text-2xl">✓</div>
          <h1 className="mt-2 text-lg font-bold">{cfg.label} を記録しました</h1>
          {judgement?.hasViolation && (
            <p className="mt-3 rounded bg-red-100 p-2 text-sm text-red-700">
              改善基準告示の警告: {(judgement.alertTypes ?? []).join(", ")}
            </p>
          )}
        </div>
        <Link href="/driver" className="mt-6 block rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white">
          メニューへ戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="text-slate-400">←</Link>
        <h1 className="text-xl font-bold">{cfg.label}</h1>
      </header>

      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-sm text-slate-600">車番</span>
          <input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value)}
            placeholder="例: 1001"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">場所（任意）</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="現在地の住所など"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <p className="text-xs text-slate-400">
          位置情報: {geoState === "ok" ? "✓ 取得済み" : geoState === "error" ? "取得できません" : "取得中..."}
        </p>

        {cfg.items && (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-slate-700">
              {cfg.items === "load" ? "積込明細" : "荷卸明細"}（最大3件）
            </span>
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs text-slate-400">{i + 1}件目</div>
                {cfg.items === "load" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="荷主" value={it.shipper ?? ""} onChange={(e) => updateItem(i, { shipper: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="着荷地" value={it.delivery_spot ?? ""} onChange={(e) => updateItem(i, { delivery_spot: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="数量" value={it.quantity ?? ""} onChange={(e) => updateItem(i, { quantity: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="重量" value={it.weight ?? ""} onChange={(e) => updateItem(i, { weight: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="伝票" value={it.slip_no ?? ""} onChange={(e) => updateItem(i, { slip_no: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="品種確認" value={it.cargo_type ?? ""} onChange={(e) => updateItem(i, { cargo_type: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="受領書枚数" value={it.receipts ?? ""} onChange={(e) => updateItem(i, { receipts: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                )}
              </div>
            ))}
            {items.length < 3 && (
              <button onClick={() => setItems((p) => [...p, {}])} className="rounded-lg border border-dashed border-slate-400 py-2 text-sm text-slate-500">
                ＋ 明細を追加
              </button>
            )}
          </div>
        )}

        {cfg.alcohol && (
          <label className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <input type="checkbox" checked={alcohol} onChange={(e) => setAlcohol(e.target.checked)} className="h-5 w-5" />
            <span className="text-sm font-medium text-amber-800">アルコールチェックを実施しました（必須）</span>
          </label>
        )}

        <label className="block">
          <span className="text-sm text-slate-600">特記（任意）</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-xl bg-slate-900 px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          {submitting ? "送信中..." : `${cfg.label} を記録`}
        </button>
      </div>
    </main>
  );
}
