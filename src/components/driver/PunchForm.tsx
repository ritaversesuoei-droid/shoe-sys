"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photo";
import { to_month_key } from "@/lib/datekey";

type EventType =
  | "departure"
  | "leg_departure"
  | "arrival"
  | "loading"
  | "unloading"
  | "long_rest"
  | "clock_out";

const CONFIG: Record<EventType, { label: string; items: "load" | "unload" | null; alcohol: boolean }> = {
  departure: { label: "出勤報告", items: null, alcohol: false },
  leg_departure: { label: "長距離再出発", items: null, alcohol: true },
  arrival: { label: "到着報告", items: null, alcohol: false },
  loading: { label: "積込完了", items: "load", alcohol: false },
  unloading: { label: "荷卸完了", items: "unload", alcohol: false },
  long_rest: { label: "長距離休憩", items: null, alcohol: true },
  clock_out: { label: "退勤報告", items: null, alcohol: false },
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
interface Plan {
  shipper?: string | null;
  delivery_spot?: string | null;
  vehicle_no?: string | null;
  note?: string | null;
}

export function PunchForm({ type, driverId, vehicleNo }: { type: EventType; driverId: string; vehicleNo: string | null }) {
  const cfg = CONFIG[type];
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "ok" | "error">("idle");
  const [alcohol, setAlcohol] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>(cfg.items ? [{}] : []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // 撮影ごとのプレビュー用オブジェクトURL（変更時に発行・破棄してリークを防ぐ）
  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  function addPhoto(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setPhotos((prev) => (prev.length >= 3 ? prev : [...prev, f]));
  }

  // 今日の予定業務（現行GAS: loadTodayPlans / applyPlan の再現）
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);

  async function loadPlans() {
    setPlansOpen((v) => !v);
    if (plans) return;
    setPlansLoading(true);
    try {
      const res = await fetch("/api/dispatch-plans/today");
      const data = await res.json();
      if (data.success) setPlans(data.plans as Plan[]);
    } catch {
      /* 予定取得失敗は打刻を妨げない */
    } finally {
      setPlansLoading(false);
    }
  }

  /** 予定をタップ→空いている最初の明細に荷主・着荷地を転記（applyPlan 準拠）。 */
  function applyPlan(p: Plan) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => !it.shipper && !it.delivery_spot);
      const t = idx >= 0 ? idx : 0;
      return prev.map((it, i) =>
        i === t ? { ...it, shipper: p.shipper ?? it.shipper, delivery_spot: p.delivery_spot ?? it.delivery_spot } : it,
      );
    });
    setPlansOpen(false);
  }

  // 位置情報の取得（車番はドライバー割当で確定・入力不要）
  useEffect(() => {
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
      // 長距離休憩・長距離再出発は確定表どおり「カメラでアルコールチェック撮影」を必須にする
      if (cfg.alcohol && photos.length === 0) throw new Error("アルコールチェックの写真を撮影してください");

      const idempotencyKey = crypto.randomUUID();

      // 写真をクライアント圧縮して非公開バケットへアップロード（4.3.5）
      const photoPaths: string[] = [];
      if (photos.length) {
        const supabase = createClient();
        const ym = to_month_key(new Date());
        for (let i = 0; i < photos.length; i++) {
          const blob = await compressImage(photos[i]!);
          const path = `${ym}/${driverId}/${idempotencyKey}_${i + 1}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("event-photos")
            .upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (upErr) throw new Error(`写真アップロード失敗: ${upErr.message}`);
          photoPaths.push(path);
        }
      }

      const cleanItems = items
        .map((it) => Object.fromEntries(Object.entries(it).filter(([, v]) => v)))
        .filter((it) => Object.keys(it).length > 0);

      const body = {
        idempotency_key: idempotencyKey,
        event_type: type,
        occurred_at: new Date().toISOString(),
        vehicle_no: vehicleNo || undefined,
        address: address || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        alcohol_checked: cfg.alcohol ? alcohol : undefined,
        note: note || undefined,
        items: cleanItems.length ? cleanItems : undefined,
        photo_paths: photoPaths.length ? photoPaths : undefined,
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
        {/* 車番は割当で確定。入力せず小さく表示するだけ */}
        <span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
          車番 {vehicleNo || "未設定"}
        </span>
      </header>

      <div className="flex flex-col gap-4">
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

            {/* 今日の予定業務を確認（現行GAS再現）: タップで荷主・着荷地を転記 */}
            {cfg.items === "load" && (
              <div>
                <button
                  type="button"
                  onClick={loadPlans}
                  className="w-full rounded-lg border border-blue-300 bg-blue-50 py-2 text-sm font-bold text-blue-700"
                >
                  📋 今日の予定業務を確認
                </button>
                {plansOpen && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    {plansLoading ? (
                      <div className="p-3 text-center text-sm text-slate-400">読み込み中...</div>
                    ) : !plans || plans.length === 0 ? (
                      <div className="p-3 text-center text-sm text-slate-400">本日の予定は見つかりませんでした</div>
                    ) : (
                      plans.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => applyPlan(p)}
                          className="block w-full border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-blue-50"
                        >
                          <div className="text-xs font-bold text-slate-400">件数 {i + 1}{p.vehicle_no ? ` ・ 車番 ${p.vehicle_no}` : ""}</div>
                          <div className="mt-0.5 text-sm font-medium text-slate-800">{p.shipper || "（荷主未定）"}</div>
                          <div className="text-xs text-slate-500">→ {p.delivery_spot || "（着荷地未定）"}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

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

        <div className={cfg.alcohol ? "rounded-lg border border-amber-300 bg-amber-50 p-3" : "block"}>
          <span className={`text-sm ${cfg.alcohol ? "font-medium text-amber-800" : "text-slate-600"}`}>
            {cfg.alcohol ? "📷 アルコールチェック写真（必須・カメラで撮影）" : "写真（荷姿 等・任意）"}
          </span>

          {/* 保存済みファイルの選択ではなく、その場でカメラを起動して撮影する */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              addPhoto(e.target.files);
              e.target.value = ""; // 同じ入力で続けて撮影できるようにリセット
            }}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`写真${i + 1}`} className="h-20 w-20 rounded-lg border border-slate-300 object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`写真${i + 1}を削除`}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-sm text-white"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < 3 && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs font-medium ${
                  cfg.alcohol ? "border-amber-400 bg-white/60 text-amber-700" : "border-slate-300 text-slate-500"
                }`}
              >
                <span className="text-2xl leading-none">📷</span>
                {photos.length === 0 ? "カメラを起動" : "追加"}
              </button>
            )}
          </div>

          <p className={`mt-1.5 text-xs ${cfg.alcohol && photos.length === 0 ? "text-amber-700" : "text-slate-400"}`}>
            {photos.length > 0
              ? `${photos.length}枚 撮影（最大3枚・自動圧縮）`
              : cfg.alcohol
                ? "アルコールチェッカーの結果をカメラで撮影してください"
                : "「カメラを起動」でその場で撮影します（最大3枚）"}
          </p>
        </div>

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
