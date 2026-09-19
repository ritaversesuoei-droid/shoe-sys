"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FuelInitialData, FuelStation } from "@/lib/operations/fuel";

/**
 * 給油記録フォーム（現行GAS「DIESEL PUMP LOG」の同デザイン・同仕様移植）。
 *   - ログイン/パスワードはセッション認証で不要化。それ以外の仕様は忠実に再現:
 *     車両番号(候補)・給油区分(宇佐美/トラック組合→満タン強制)・満タン・ODD・給油量、
 *     逆転/2500km/600Lガード、逐次フォーカス、結果モーダル、今月の成績スコアボード。
 */

const RETRO_CSS = `
/* 他のドライバー画面と同じく中央寄せ・スマホ幅(max-w-md=28rem)に収める。背景の柄は全面(::before)に敷く。 */
.fuel-app{position:relative;max-width:28rem;margin:0 auto;padding:16px;min-height:100dvh;font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.4;color:#2b2b2b;}
.fuel-app::before{content:"";position:fixed;inset:0;z-index:-1;background-color:#f2ebd9;background-image:radial-gradient(#e6dcbf 1px,transparent 1px);background-size:16px 16px;}
.fuel-app .billboard{background-color:#c93b2b;color:#fff;text-align:center;padding:14px 10px;border:4px double #fff;border-radius:8px;box-shadow:0 4px 8px rgba(0,0,0,.15);margin-bottom:12px;}
.fuel-app .billboard h2{margin:0;font-family:Impact,'Arial Black',sans-serif;letter-spacing:2px;font-size:24px;text-shadow:2px 2px 0 #1a365d;}
.fuel-app .muted{color:#5c5543;font-size:12px;font-weight:bold;text-align:center;margin-bottom:12px;}
.fuel-app .card{background:#fff;border-radius:6px;padding:14px;margin:12px 0;box-shadow:3px 3px 0 #1a365d;border:2px solid #1a365d;}
.fuel-app label{display:block;margin-top:16px;font-weight:900;font-size:14px;color:#1a365d;text-transform:uppercase;}
.fuel-app input[type=number],.fuel-app input[type=text]{width:100%;font-size:18px;padding:12px;margin-top:6px;border-radius:6px;border:2px solid #1a365d;box-sizing:border-box;background:#fff;font-weight:bold;}
.fuel-app input:focus{outline:none;background-color:#fffbf2;}
.fuel-app input:disabled{background:#e6dfcf;color:#8c836e;border-color:#bfae93;}
.fuel-app .focusNext{background-color:#dbeafe!important;border-color:#c93b2b!important;box-shadow:0 0 0 4px rgba(201,59,43,.2);}
.fuel-app .btn{width:100%;border:2px solid #1a365d;background:#a3aab5;color:#fff;font-family:Impact,'Arial Black',sans-serif;letter-spacing:1px;font-size:20px;padding:14px;border-radius:6px;cursor:pointer;box-shadow:0 4px 0 #1a365d;transition:all .1s ease;}
.fuel-app .btn.active{background:#c93b2b;color:#fff;box-shadow:0 4px 0 #61150c;}
.fuel-app .btn.active:active{transform:translateY(4px);box-shadow:none;}
.fuel-app .btn:disabled{opacity:.7;}
.fuel-app .error{color:#c93b2b;font-weight:900;margin-top:12px;font-size:15px;}
.fuel-app .warn{color:#d97706;font-weight:900;margin-top:8px;font-size:15px;}
.fuel-app .checkbox-row{display:flex;align-items:center;gap:12px;margin-top:12px;padding:12px;border:2px solid #1a365d;border-radius:6px;background:#fff;box-shadow:2px 2px 0 #1a365d;}
.fuel-app .checkbox-row.focusNext{border-color:#c93b2b;background:#dbeafe;}
.fuel-app .checkbox-row input{width:24px;height:24px;accent-color:#c93b2b;margin:0;cursor:pointer;}
.fuel-app .checkbox-label{font-size:16px;font-weight:900;color:#1a365d;}
.fuel-app .driver-btn{background:#1a365d;color:#fff;border:2px dashed #fff;padding:10px;border-radius:6px;text-align:center;cursor:pointer;box-shadow:0 4px 0 #0b1829;display:block;margin-top:6px;width:100%;font-size:16px;}
.fuel-app .status-badge{background-color:#c93b2b;color:#fff;padding:3px 8px;font-weight:bold;border-radius:4px;font-size:11px;}
.fuel-app .suggestions{border:2px solid #1a365d;border-top:none;border-radius:0 0 6px 6px;background:#fff;max-height:150px;overflow-y:auto;margin-top:-4px;position:absolute;width:100%;z-index:10;box-shadow:3px 3px 0 rgba(0,0,0,.1);}
.fuel-app .suggestion-item{padding:10px;cursor:pointer;font-size:16px;font-weight:bold;}
.fuel-app .suggestion-item:active{background:#dbeafe;}
.fuel-app .overlay{position:fixed;inset:0;background:rgba(26,54,93,.75);display:flex;align-items:center;justify-content:center;padding:18px;z-index:100;}
.fuel-app .modal{background:#fffbf2;border:4px solid #1a365d;border-radius:12px;padding:20px;width:min(540px,100%);box-shadow:6px 6px 0 #c93b2b;text-align:center;}
.fuel-app .pill{display:inline-block;padding:6px 16px;border-radius:4px;font-weight:900;font-size:15px;border:2px solid #1a365d;background:#e6dfcf;}
.fuel-app .pill.good{background:#34d399;color:#1a365d;}
.fuel-app .pill.bad{background:#f87171;color:#fff;}
.fuel-app .big{font-family:Impact,'Arial Black',sans-serif;font-size:44px;line-height:1.1;margin:12px 0;color:#c93b2b;letter-spacing:1px;}
.fuel-app .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;text-align:left;}
.fuel-app .box{background:#fff;border:2px solid #1a365d;border-radius:6px;padding:10px;box-shadow:2px 2px 0 #1a365d;}
.fuel-app .box b{display:block;font-size:11px;color:#5c5543;}
.fuel-app .box div{font-size:18px;font-weight:bold;color:#1a365d;margin-top:2px;}
.fuel-app .award-card{background:#1a365d;border:4px solid #c93b2b;padding:15px;border-radius:6px;margin-top:10px;text-align:left;}
.fuel-app .award-title{font-family:Impact,'Arial Black',sans-serif;text-align:center;color:#fff;font-size:22px;margin-bottom:12px;letter-spacing:1px;text-shadow:2px 2px 0 #c93b2b;}
.fuel-app .score-box{background:#fffbf2;border:2px solid #c93b2b;border-radius:4px;padding:12px;text-align:center;margin-bottom:10px;}
.fuel-app .score-label{font-size:12px;color:#1a365d;font-weight:900;text-transform:uppercase;display:block;margin-bottom:2px;}
.fuel-app .score-num{font-family:Impact,'Arial Black',sans-serif;font-size:36px;color:#c93b2b;line-height:1;letter-spacing:1px;}
.fuel-app .cheer-title{font-family:Impact,'Arial Black',sans-serif;font-size:30px;color:#fff;text-shadow:3px 3px 0 #c93b2b;margin-bottom:10px;}
.fuel-app .star{font-size:40px;letter-spacing:4px;animation:fuelpulse .6s infinite alternate;margin:15px 0;}
@keyframes fuelpulse{from{transform:scale(.85);}to{transform:scale(1.15);}}
`;

type Step = "vehicle" | "station" | "odo" | "liters" | "send";

export function FuelForm({
  driverName,
  initial,
  stations,
}: {
  driverName: string;
  initial: FuelInitialData;
  stations: FuelStation[];
}) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState(initial.baseVehicle ?? "");
  const [station, setStation] = useState(""); // 選択中の給油所名
  const [isFull, setIsFull] = useState(false);
  const [odo, setOdo] = useState("");
  const [liters, setLiters] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    good: boolean | null; // null=つなぎ
    fuel: string;
    target: string;
    diff: string;
    sub: string;
  }>(null);
  const [cheer, setCheer] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const submittingRef = useRef(false);

  // 車両ごと最新ODD（保存後は楕観更新＋サーバー再取得で同期）
  const [lastOdoMap, setLastOdoMap] = useState<Record<string, number>>(initial.lastOdoMap);
  useEffect(() => setLastOdoMap(initial.lastOdoMap), [initial.lastOdoMap]);

  // 給油所ごとの「満タン固定」フラグ（例: トラック組合）。固定の給油所を選ぶと満タンON＋ロック。
  const selectedStation = stations.find((s) => s.name === station);
  const fullLocked = selectedStation?.forceFull ?? false;
  useEffect(() => {
    if (fullLocked) setIsFull(true);
  }, [fullLocked]);

  const vCode = vehicle.trim();
  const prevOdo = lastOdoMap[vCode];
  const odoNum = Number(odo);
  const litersNum = Number(liters);

  // 検証（GAS updateUI 準拠）: 逐次アンロック＋逆転/2500km/600Lガード
  const v = useMemo((): { step: Step; error: string; warn: string; valid: boolean; odoEnabled: boolean; litersEnabled: boolean } => {
    if (!vCode) return { step: "vehicle", error: "", warn: "", valid: false, odoEnabled: false, litersEnabled: false };
    if (!station) return { step: "station", error: "", warn: "", valid: false, odoEnabled: false, litersEnabled: false };
    const hasOdo = odo !== "" && Number.isFinite(odoNum);
    if (!hasOdo) return { step: "odo", error: "", warn: "", valid: false, odoEnabled: true, litersEnabled: false };
    const base = prevOdo !== undefined ? prevOdo : odoNum;
    const deltaKm = odoNum - base;
    if (deltaKm < 0)
      return { step: "odo", error: `メーター値が前回（${base.toLocaleString()}km）より逆転しています。`, warn: "", valid: false, odoEnabled: true, litersEnabled: false };
    if (deltaKm >= 2500)
      return { step: "odo", error: "", warn: "前回給油から 2,500km 以上走行しています（送信不可）", valid: false, odoEnabled: true, litersEnabled: false };
    const hasLiters = liters !== "" && Number.isFinite(litersNum) && litersNum > 0;
    if (!hasLiters) return { step: "liters", error: "", warn: "", valid: false, odoEnabled: true, litersEnabled: true };
    if (litersNum > 600) return { step: "liters", error: "", warn: "給油量が 600L を超えています（送信不可）", valid: false, odoEnabled: true, litersEnabled: true };
    return { step: "send", error: "", warn: "", valid: true, odoEnabled: true, litersEnabled: true };
  }, [vCode, station, odo, odoNum, liters, litersNum, prevOdo]);

  const focus = (s: Step) => (v.step === s ? "focusNext" : "");

  const vehicleSuggestions = useMemo(() => {
    if (!vehicle.trim()) return [];
    return initial.vehicleList.filter((x) => x.includes(vehicle.trim())).slice(0, 30);
  }, [vehicle, initial.vehicleList]);

  async function submit() {
    if (!v.valid || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/fuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_no: vCode, station, odometer: odoNum, liters: litersNum, is_full: isFull }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "送信に失敗しました");

      const deltaKm = Number(d.delta_km ?? 0);
      const sub = `走行: ${deltaKm.toLocaleString()}km / 給油: ${litersNum}L / 地点: ${station}`;
      if (!isFull || d.fuel_km_l == null) {
        setResult({ good: null, fuel: "--", target: `${initial.targetFuel.toFixed(2)} km/L`, diff: "--", sub });
      } else {
        const fuel = Number(d.fuel_km_l);
        const diff = Math.round((fuel - initial.targetFuel) * 100) / 100;
        setResult({
          good: diff >= 0,
          fuel: `${fuel.toFixed(2)} km/L`,
          target: `${initial.targetFuel.toFixed(2)} km/L`,
          diff: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} km/L`,
          sub,
        });
      }
      // 楽観更新: 次の入力のため最新ODDを反映
      setLastOdoMap((m) => ({ ...m, [vCode]: odoNum }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function closeResultAndReset() {
    setResult(null);
    setCheer(true);
    // フォーム初期化＋サーバー再取得（成績/最新ODDの同期）
    setOdo("");
    setLiters("");
    setStation("");
    setIsFull(false);
    router.refresh();
    setTimeout(() => setCheer(false), 3000);
  }

  if (!initial.ready) {
    return (
      <div className="fuel-app">
        <style dangerouslySetInnerHTML={{ __html: RETRO_CSS }} />
        <div className="billboard"><h2>⛽ 給油記録</h2></div>
        <div className="card">
          <p style={{ color: "#c93b2b", fontWeight: 900 }}>給油記録は準備中です。</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>データベースのマイグレーション（<code>npm run db:push</code>）が未適用です。適用後にご利用いただけます。</p>
          <Link href="/driver" className="driver-btn" style={{ marginTop: 12 }}>← メニューへ戻る</Link>
        </div>
      </div>
    );
  }

  const diffNum = Number(initial.fuelDiff) || 0;

  return (
    <div className="fuel-app">
      <style dangerouslySetInnerHTML={{ __html: RETRO_CSS }} />
      <div className="billboard"><h2>⛽ 給油記録 / DIESEL PUMP LOG</h2></div>
      <div className="muted">※ 給油のたびに記録してください</div>

      {/* MY PERFORMANCE */}
      <div className="card" style={{ background: "#fffbf2", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="status-badge">★ MY PERFORMANCE ★</span>
          <Link href="/driver" style={{ fontSize: 12, fontWeight: "bold", color: "#1a365d" }}>← メニュー</Link>
        </div>
        <button type="button" className="driver-btn" onClick={() => setShowStats(true)}>
          👤 <b style={{ fontSize: 20 }}>{driverName}</b> さん ｜ 📊 今月の成績を見る
        </button>
        <span style={{ fontSize: 12, color: "#5c5543", fontWeight: "bold", display: "inline-block", marginTop: 8 }}>
          基本車番: {initial.baseVehicle ?? "--"}
        </span>
      </div>

      {/* 車両番号 */}
      <div style={{ position: "relative" }}>
        <label>TRUCK NUMBER / 車両番号</label>
        <input
          type="text"
          value={vehicle}
          placeholder="例: 0675"
          autoComplete="off"
          className={focus("vehicle")}
          onChange={(e) => { setVehicle(e.target.value); setSugOpen(true); }}
          onFocus={() => setSugOpen(true)}
          onBlur={() => setTimeout(() => setSugOpen(false), 150)}
        />
        {sugOpen && vehicleSuggestions.length > 0 && (
          <div className="suggestions">
            {vehicleSuggestions.map((s) => (
              <div key={s} className="suggestion-item" onMouseDown={() => { setVehicle(s); setSugOpen(false); }}>{s}</div>
            ))}
          </div>
        )}
      </div>

      {/* 給油区分（給油所マスタから動的表示・管理画面で増減可） */}
      <label>STATION / 給油区分</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
        {stations.map((s) => (
          <label key={s.name} className={`checkbox-row ${focus("station")}`} style={{ flex: "1 1 45%", marginTop: 0 }}>
            <input type="radio" name="station" checked={station === s.name} onChange={() => setStation(s.name)} />
            <span className="checkbox-label">{s.name}</span>
          </label>
        ))}
      </div>

      {/* 満タン */}
      <label className="checkbox-row" style={{ opacity: fullLocked ? 0.85 : 1 }}>
        <input type="checkbox" checked={isFull} disabled={fullLocked} onChange={(e) => setIsFull(e.target.checked)} />
        <span className="checkbox-label">FULL TANK / 満タン給油{fullLocked ? "（組合は満タン固定）" : ""}</span>
      </label>

      {/* オドメーター */}
      <label>ODOMETER / オドメーター (km)</label>
      {prevOdo !== undefined && (
        <span style={{ fontSize: 12, fontWeight: "bold", color: "#5c5543" }}>前回給油ODD: {prevOdo.toLocaleString()} km</span>
      )}
      <input type="number" inputMode="numeric" value={odo} placeholder="現在の総走行距離" disabled={!v.odoEnabled} className={focus("odo")} onChange={(e) => setOdo(e.target.value)} />

      {/* 給油量 */}
      <label>REFUEL LITERS / 給油量 (L)</label>
      <input type="number" inputMode="decimal" value={liters} placeholder="給油量(リットル)" disabled={!v.litersEnabled} className={focus("liters")} onChange={(e) => setLiters(e.target.value)} />

      {v.error && <div className="error">{v.error}</div>}
      {v.warn && <div className="warn">{v.warn}</div>}

      <button className={`btn ${v.valid ? "active" : ""}`} style={{ marginTop: 24 }} disabled={!v.valid || submitting} onClick={submit}>
        {submitting ? "SENDING..." : "PUNCH DATA / 送信"}
      </button>

      {/* 結果モーダル */}
      {result && (
        <div className="overlay">
          <div className="modal">
            <div className={`pill ${result.good === null ? "" : result.good ? "good" : "bad"}`}>
              {result.good === null ? "PARTIAL TANK" : result.good ? "MILEAGE WIN!" : "MILEAGE LOW"}
            </div>
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 12, color: "#1a365d" }}>
              {result.good === null ? "つなぎ給油として記録" : "今回の燃費実績"}
            </div>
            <div className="big">{result.good === null ? "NO CALC" : result.fuel}</div>
            <div className="muted" style={{ marginBottom: 0 }}>{result.sub}</div>
            <div className="grid">
              <div className="box"><b>今回燃費</b><div>{result.fuel}</div></div>
              <div className="box"><b>目標（基準）燃費</b><div>{result.target}</div></div>
              <div className="box"><b>目標との差</b><div>{result.diff}</div></div>
              <div className="box"><b>担当ドライバー</b><div>{driverName}</div></div>
            </div>
            <button className="btn active" style={{ marginTop: 16 }} onClick={closeResultAndReset}>CLOSE / 閉じる</button>
          </div>
        </div>
      )}

      {/* 送信後の演出 */}
      {cheer && (
        <div className="overlay" style={{ background: "rgba(13,39,77,.95)" }}>
          <div style={{ textAlign: "center" }}>
            <div className="cheer-title">THANK YOU DRIVER!</div>
            <div style={{ color: "#f2ebd9", fontWeight: "bold", fontSize: 18 }}>安全運転お疲れ様です！</div>
            <div className="star">🇯🇵✨🚛🌟🚛✨🇯🇵</div>
            <div style={{ color: "#a3aab5", fontSize: 14, marginTop: 10 }}>データを記録しました。<br />数秒後に入力画面へ戻ります…</div>
          </div>
        </div>
      )}

      {/* 今月の成績スコアボード */}
      {showStats && (
        <div className="overlay">
          <div className="modal">
            <div className="pill" style={{ background: "#c93b2b", color: "#fff", borderColor: "#c93b2b" }}>MILEAGE SCORE</div>
            <div className="award-card">
              <div className="award-title">DRIVER&apos;S SCORE BOARD</div>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#fff", borderBottom: "2px dashed #c93b2b", paddingBottom: 8, textAlign: "center", marginBottom: 12 }}>
                PILOT: <span style={{ color: "#e6dcbf" }}>{driverName}</span> 殿
              </div>
              <div className="score-box" style={{ borderWidth: 3 }}>
                <span className="score-label">今月の平均燃費</span>
                <div className="score-num" style={{ fontSize: 42 }}>{initial.monthFuel > 0 ? initial.monthFuel.toFixed(2) : "0.00"} km/L</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="score-box">
                  <span className="score-label">今期の目標燃費</span>
                  <div className="score-num" style={{ color: "#1a365d" }}>{initial.targetFuel.toFixed(2)}</div>
                  <span style={{ fontSize: 10, fontWeight: "bold", color: "#666" }}>km/L</span>
                </div>
                <div className="score-box">
                  <span className="score-label">今期の達成回数</span>
                  <div className="score-num" style={{ color: "#16a34a" }}>{initial.periodSuccess}</div>
                  <span style={{ fontSize: 10, fontWeight: "bold", color: "#666" }}>TIMES</span>
                </div>
              </div>
              <div className="score-box" style={{ marginBottom: 0, padding: 8 }}>
                <span className="score-label" style={{ display: "inline" }}>目標との現在の差: </span>
                <b style={{ fontSize: 18, fontWeight: 900, color: diffNum < 0 ? "#c93b2b" : "#16a34a" }}>
                  {diffNum >= 0 ? "+" : ""}{diffNum.toFixed(2)} km/L
                </b>
              </div>
            </div>
            <button className="btn active" style={{ background: "#1a365d", marginTop: 12 }} onClick={() => setShowStats(false)}>RETURN / 戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
