"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photo";
import { to_month_key } from "@/lib/datekey";
import { TenkeyInput } from "@/components/driver/TenkeyInput";

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

// 確認モードの短縮名・アイコン・案内文
const CONFIRM_META: Partial<Record<EventType, { short: string; icon: string; msg: string }>> = {
  departure: { short: "出勤", icon: "☀️", msg: "管理者に「出勤」を報告します" },
  clock_out: { short: "退勤", icon: "🌙", msg: "管理者に「退勤」を報告します" },
  arrival: { short: "到着", icon: "📍", msg: "現在地とともに「到着」を報告します" },
};

// 写真は複数枚送るケースが多いので上限を広めに
const MAX_PHOTOS = 8;

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

export function PunchForm({
  type,
  driverId,
  driverName,
  vehicleNo,
  unloadTargets = [],
}: {
  type: EventType;
  driverId: string;
  driverName?: string | null;
  vehicleNo: string | null;
  unloadTargets?: string[];
}) {
  const cfg = CONFIG[type];
  // 目的別モード: unload=荷卸（対象選択＋確認項目） / detail=積込（明細） /
  //   photo=長距離（アルコール写真のみ） / confirm=出勤・退勤・到着（確認のみ）
  const mode: "confirm" | "photo" | "detail" | "unload" =
    type === "unloading" ? "unload" : cfg.items ? "detail" : cfg.alcohol ? "photo" : "confirm";

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "ok" | "error">("idle");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>(cfg.items ? [{}] : []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // 荷卸専用（対象選択・確認3項目・受領書枚数・往復業務）
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [chkAbnormal, setChkAbnormal] = useState(false); // 荷物異常なし
  const [chkDate, setChkDate] = useState(false); // 受領印日付OK
  const [chkWork, setChkWork] = useState(false); // 荷下ろし作業あり
  const [receipts, setReceipts] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);

  // 撮影プレビュー用オブジェクトURL（変更時に発行・破棄）
  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

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

  // カメラ／ライブラリー どちらからでも、複数枚まとめて追加（上限 MAX_PHOTOS）
  function addPhoto(list: FileList | null) {
    if (!list || list.length === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const f of Array.from(list)) {
        if (next.length >= MAX_PHOTOS) break;
        next.push(f);
      }
      return next;
    });
  }
  function updateItem(i: number, patch: Item) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  // 今日の予定業務（現行GAS: loadTodayPlans / applyPlan の再現）
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

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "photo" && photos.length === 0) throw new Error("写真を撮影してください");

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

      // 荷卸: 選択した対象＋受領書枚数を1明細に、確認項目を checks に
      const unloadItem: Record<string, string> = {};
      const dests = [...targets];
      if (dests.length) unloadItem.delivery_spot = dests.join(" / ");
      if (receipts) unloadItem.receipts = receipts;
      const unloadChecks =
        [chkAbnormal && "荷物異常なし", chkDate && "受領印日付OK", chkWork && "荷下ろし作業あり", roundTrip && "往復業務"]
          .filter(Boolean)
          .join(" / ") || undefined;

      const body = {
        idempotency_key: idempotencyKey,
        event_type: type,
        occurred_at: new Date().toISOString(),
        vehicle_no: vehicleNo || undefined,
        address: undefined, // 住所はサーバー側で緯度経度から自動補完（F-22）
        lat: coords?.lat,
        lng: coords?.lng,
        // 長距離（写真モード）は撮影＝アルコールチェック実施とみなす
        alcohol_checked: cfg.alcohol ? true : undefined,
        checks: mode === "unload" ? unloadChecks : undefined,
        note: mode === "detail" || mode === "unload" ? note || undefined : undefined,
        items:
          mode === "detail"
            ? cleanItems.length
              ? cleanItems
              : undefined
            : mode === "unload"
              ? Object.keys(unloadItem).length
                ? [unloadItem]
                : undefined
              : undefined,
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
          <h1 className="mt-2 text-lg font-bold">{cfg.label} を送信しました</h1>
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

  const geoText = geoState === "ok" ? "✓ 取得済み" : geoState === "error" ? "取得できません" : "取得中...";
  const now = new Date();
  const md = `${now.getMonth() + 1}/${now.getDate()}`;

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4 flex items-center gap-2">
        {mode === "detail" ? (
          <>
            <h1 className="text-2xl font-black text-slate-800">{cfg.label}詳細</h1>
            {items.length < 3 && (
              <button
                type="button"
                onClick={() => setItems((p) => [...p, {}])}
                className="ml-auto rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white active:scale-95"
              >
                ＋ 複数処理
              </button>
            )}
          </>
        ) : (
          <>
            <Link href="/driver" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600 active:scale-95">← 戻る</Link>
            <h1 className="text-xl font-bold">{cfg.label}</h1>
            {driverName && (
              <span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{driverName}</span>
            )}
          </>
        )}
      </header>

      {/* 写真入力（カメラ／ライブラリー 共通・複数対応）。各モードのボタンから起動 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addPhoto(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addPhoto(e.target.files);
          e.target.value = "";
        }}
      />

      {/* ── 確認のみ（出勤・退勤・到着）── */}
      {mode === "confirm" && (
        <div className="flex flex-col gap-5 pt-2">
          <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-6 text-center">
            <div className="text-5xl">{CONFIRM_META[type]?.icon}</div>
            <p className="mt-3 text-lg font-bold text-slate-800">{CONFIRM_META[type]?.msg}</p>
            <p className="mt-2 text-sm text-slate-500">位置情報: {geoText}{geoState === "error" && "（送信は可能）"}</p>
          </div>
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
          <button onClick={submit} disabled={submitting} className="rounded-2xl bg-slate-900 px-4 py-5 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50">
            {submitting ? "送信中..." : `${CONFIRM_META[type]?.short}を送信`}
          </button>
          <Link href="/driver" className="rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-base font-bold text-slate-600 active:scale-[0.99]">← 戻る</Link>
        </div>
      )}

      {/* ── アルコール写真のみ（長距離再出発・長距離休憩）── */}
      {mode === "photo" && (
        <div className="flex flex-col gap-5 pt-2">
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
            <p className="text-lg font-bold text-amber-800">📷 アルコールチェック</p>
            <p className="mt-1 text-sm text-amber-700">撮影、またはライブラリーから選択して送信してください</p>
          </div>
          {previews.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`写真${i + 1}`} className="h-36 w-36 rounded-lg border border-slate-300 object-cover" />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="削除"
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 py-8 text-base font-bold text-amber-700 active:scale-[0.99]"
              >
                <span className="text-4xl">📷</span>
                カメラで撮影
              </button>
              <button
                onClick={() => libraryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 py-8 text-base font-bold text-amber-700 active:scale-[0.99]"
              >
                <span className="text-4xl">🖼</span>
                ライブラリーから選択
              </button>
            </div>
          )}
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting || photos.length === 0}
            className="rounded-2xl bg-orange-600 px-4 py-5 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? "送信中..." : `この写真を送信${photos.length > 1 ? `（${photos.length}枚）` : ""}`}
          </button>
          <Link href="/driver" className="rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-base font-bold text-slate-600 active:scale-[0.99]">← 戻る</Link>
        </div>
      )}

      {/* ── 積込完了 詳細（現行GAS「積込完了詳細」再現）── */}
      {mode === "detail" && (
        <div className="flex flex-col gap-4">
          {/* 今日の予定業務を確認（タップで荷主・着荷地を転記） */}
          <div>
            <button type="button" onClick={loadPlans} className="w-full rounded-xl border-2 border-blue-300 bg-white py-3 text-base font-bold text-blue-600 active:scale-[0.99]">
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

          <hr className="border-slate-200" />

          {/* 明細カード（1件目～最大3件） */}
          {items.map((it, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">{i + 1}件目：詳細入力　荷主名</span>
                {/* 1件目は必須なので削除ボタンを出さない（2件目以降のみ） */}
                {i > 0 && (
                  <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} className="rounded px-2 py-0.5 text-xs font-bold text-red-500 hover:bg-red-50">
                    🗑 削除
                  </button>
                )}
              </div>
              <input placeholder="荷主名（自動転記可）" value={it.shipper ?? ""} onChange={(e) => updateItem(i, { shipper: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
              <div className="mb-1 mt-3 text-sm font-bold text-slate-700">着荷地名</div>
              <input placeholder="例：〇〇センター" value={it.delivery_spot ?? ""} onChange={(e) => updateItem(i, { delivery_spot: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">数量</div>
                  <TenkeyInput value={it.quantity ?? ""} onChange={(v) => updateItem(i, { quantity: v })} className="w-full rounded-lg border border-slate-300 px-2 py-2.5 text-base" />
                </div>
                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">重量</div>
                  <TenkeyInput value={it.weight ?? ""} onChange={(v) => updateItem(i, { weight: v })} className="w-full rounded-lg border border-slate-300 px-2 py-2.5 text-base" />
                </div>
                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">伝票</div>
                  <TenkeyInput value={it.slip_no ?? ""} onChange={(v) => updateItem(i, { slip_no: v })} className="w-full rounded-lg border border-slate-300 px-2 py-2.5 text-base" />
                </div>
              </div>
            </div>
          ))}

          {/* 備考 */}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="積込時の備考（任意）" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base" />

          {/* 写真（カメラ／ライブラリー・複数可） */}
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`写真${i + 1}`} className="h-20 w-20 rounded-lg border border-slate-300 object-cover" />
                <button onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} aria-label="削除" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-sm text-white">×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500">
                  <span className="text-2xl leading-none">📷</span>カメラ
                </button>
                <button type="button" onClick={() => libraryInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500">
                  <span className="text-2xl leading-none">🖼</span>ライブラリー
                </button>
              </>
            )}
          </div>

          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          <button onClick={submit} disabled={submitting} className="rounded-2xl bg-[#3d9aa5] px-4 py-5 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50">
            {submitting ? "送信中..." : "この内容で送信"}
          </button>
          <Link href="/driver" className="text-center text-base font-bold text-blue-600 underline">戻る</Link>
        </div>
      )}

      {/* ── 荷卸完了（現行GAS f-niroshi の再現）── */}
      {mode === "unload" && (
        <div className="flex flex-col gap-4">
          {/* 日付＋往復業務 */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-black text-red-600">{md}</span>
            <button
              type="button"
              onClick={() => setRoundTrip((v) => !v)}
              className={`rounded-lg border-2 px-3 py-1 text-sm font-bold ${roundTrip ? "border-blue-600 bg-blue-600 text-white" : "border-blue-400 text-blue-600"}`}
            >
              往復業務
            </button>
          </div>

          {/* 荷卸し対象を選択（直近の積込から） */}
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <p className="mb-2 text-sm font-bold text-slate-700">▼ 荷卸し対象を選択(複数可)</p>
            {unloadTargets.length === 0 ? (
              <p className="text-sm text-slate-400">直近の積込情報が見つかりません</p>
            ) : (
              <div className="flex flex-col gap-1">
                {unloadTargets.map((t) => (
                  <label key={t} className="flex items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      checked={targets.has(t)}
                      onChange={(e) =>
                        setTargets((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(t);
                          else n.delete(t);
                          return n;
                        })
                      }
                      className="h-6 w-6"
                    />
                    <span className="text-lg font-bold text-slate-800">{t}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-200" />

          {/* 確認3項目 */}
          <div className="flex flex-col gap-3 px-1">
            <label className="flex items-center gap-3 text-lg font-bold text-slate-800">
              <input type="checkbox" checked={chkAbnormal} onChange={(e) => setChkAbnormal(e.target.checked)} className="h-6 w-6" />
              荷物異常なし
            </label>
            <label className="flex items-center gap-3 text-lg font-bold text-slate-800">
              <input type="checkbox" checked={chkDate} onChange={(e) => setChkDate(e.target.checked)} className="h-6 w-6" />
              受領印日付OK
            </label>
            <label className="flex items-center gap-3 text-lg font-bold text-slate-800">
              <input type="checkbox" checked={chkWork} onChange={(e) => setChkWork(e.target.checked)} className="h-6 w-6" />
              荷下ろし作業あり
            </label>
          </div>

          <TenkeyInput
            placeholder="受領書枚数"
            value={receipts}
            onChange={setReceipts}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
          <textarea
            placeholder="荷卸時の備考（任意）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-2xl bg-violet-700 px-4 py-4 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? "送信中..." : "この内容で送信"}
          </button>
          <Link href="/driver" className="rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-base font-bold text-slate-600 active:scale-[0.99]">← 戻る</Link>
        </div>
      )}
    </main>
  );
}
