"use client";

import { useState } from "react";

/** 日報PDFを生成して新規タブで開く（F-17/18, 印刷用日報）。管理者・本人のみ。 */
export default function ReportPdfButton({
  date,
  driverId,
  label = "日報PDFを開く",
  small = false,
}: {
  date: string;
  driverId: string;
  label?: string;
  small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    if (!date || !driverId) {
      setErr("日付とドライバーを選択してください");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/reports/${date}/${driverId}/pdf`, { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "PDF生成に失敗しました");
      window.open(j.url, "_blank", "noopener");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={open}
        disabled={busy}
        className={
          small
            ? "rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:opacity-50"
            : "rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        }
      >
        {busy ? "生成中..." : label}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
