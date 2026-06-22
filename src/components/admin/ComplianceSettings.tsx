"use client";

import { useEffect, useState } from "react";

type Unit = "h" | "min" | "int" | "time";
interface Field {
  path: string[];
  label: string;
  unit: Unit;
}

const FIELDS: Field[] = [
  { path: ["night", "start"], label: "深夜 開始", unit: "time" },
  { path: ["night", "end"], label: "深夜 終了", unit: "time" },
  { path: ["daily_restraint", "principle_min"], label: "1日拘束 原則", unit: "h" },
  { path: ["daily_restraint", "max_min"], label: "1日拘束 上限", unit: "h" },
  { path: ["daily_restraint", "extended_threshold_min"], label: "1日拘束 延長閾値", unit: "h" },
  { path: ["daily_restraint", "extended_count_per_week"], label: "延長の週上限回数", unit: "int" },
  { path: ["rest_period", "principle_min"], label: "休息 基本", unit: "h" },
  { path: ["rest_period", "min_floor_min"], label: "休息 下限", unit: "h" },
  { path: ["monthly_restraint", "principle_min"], label: "月拘束 原則", unit: "h" },
  { path: ["monthly_restraint", "agreement_max_min"], label: "月拘束 協定上限", unit: "h" },
  { path: ["yearly_restraint", "principle_min"], label: "年拘束 原則", unit: "h" },
  { path: ["yearly_restraint", "agreement_max_min"], label: "年拘束 上限", unit: "h" },
  { path: ["driving_time", "two_day_avg_daily_max_min"], label: "運転 2日平均/日", unit: "h" },
  { path: ["driving_time", "two_week_avg_weekly_max_min"], label: "運転 2週平均/週", unit: "h" },
  { path: ["continuous_driving", "max_min"], label: "連続運転 上限", unit: "h" },
  { path: ["continuous_driving", "break_unit_min"], label: "中断1回(分)", unit: "min" },
  { path: ["continuous_driving", "break_total_min"], label: "中断合計(分)", unit: "min" },
];

type Cfg = Record<string, Record<string, number | string>>;

function getVal(cfg: Cfg, path: string[]): number | string | undefined {
  return cfg[path[0]!]?.[path[1]!];
}
function setVal(cfg: Cfg, path: string[], v: number | string): Cfg {
  return { ...cfg, [path[0]!]: { ...(cfg[path[0]!] ?? {}), [path[1]!]: v } };
}
function toInput(unit: Unit, raw: number | string | undefined): string {
  if (raw == null) return "";
  if (unit === "h") return String((Number(raw) / 60).toFixed(2)).replace(/\.00$/, "");
  return String(raw);
}
function fromInput(unit: Unit, s: string): number | string {
  if (unit === "time") return s;
  if (unit === "h") return Math.round(Number(s) * 60);
  return Math.round(Number(s));
}

export function ComplianceSettings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [lineLimit, setLineLimit] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        const comp = d.settings.find((s: { key: string }) => s.key === "compliance");
        const line = d.settings.find((s: { key: string }) => s.key === "line");
        setCfg((comp?.value ?? {}) as Cfg);
        setLineLimit(line?.value?.monthly_limit != null ? String(line.value.monthly_limit) : "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const c = await fetch("/api/admin/settings/compliance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: cfg, description: "改善基準告示 判定パラメータ" }),
      }).then((r) => r.json());
      if (!c.success) throw new Error(c.error);
      if (lineLimit) {
        const l = await fetch("/api/admin/settings/line", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: { monthly_limit: Number(lineLimit) }, description: "LINE通知 月上限" }),
        }).then((r) => r.json());
        if (!l.success) throw new Error(l.error);
      }
      setMsg("保存しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !cfg) return <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>;
  if (!cfg) return <p className="text-slate-400">読込中...</p>;

  return (
    <div>
      <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
        ⚠ 改善基準告示の数値は法令・労使協定に基づきます。<strong>社労士の確認のうえ</strong>設定してください。時間は h（時間）単位で入力。
      </p>
      {msg && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.path.join(".")} className="block">
            <span className="text-xs text-slate-500">
              {f.label}
              {f.unit === "h" ? "（h）" : f.unit === "min" ? "（分）" : f.unit === "int" ? "（回）" : ""}
            </span>
            <input
              type={f.unit === "time" ? "time" : "number"}
              step={f.unit === "h" ? "0.5" : "1"}
              value={toInput(f.unit, getVal(cfg, f.path))}
              onChange={(e) => setCfg((c) => setVal(c!, f.path, fromInput(f.unit, e.target.value)))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        ))}
        <label className="block">
          <span className="text-xs text-slate-500">LINE 月上限（件）</span>
          <input type="number" value={lineLimit} onChange={(e) => setLineLimit(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      <button onClick={save} disabled={saving} className="mt-5 rounded-xl bg-slate-900 px-6 py-2.5 font-medium text-white disabled:opacity-50">
        {saving ? "保存中..." : "設定を保存"}
      </button>
    </div>
  );
}
