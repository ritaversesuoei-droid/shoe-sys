"use client";

/** 印刷用日報（HTML）を新規タブで開く（F-17/18, 印刷用日報）。ブラウザ印刷でPDF化。管理者・本人のみ。 */
export default function ReportPdfButton({
  date,
  driverId,
  label = "日報を表示/印刷",
  small = false,
}: {
  date: string;
  driverId: string;
  label?: string;
  small?: boolean;
}) {
  function open() {
    if (!date || !driverId) return;
    window.open(`/api/reports/${date}/${driverId}/print`, "_blank", "noopener");
  }
  return (
    <button
      onClick={open}
      className={
        small
          ? "rounded bg-slate-700 px-2 py-1 text-xs text-white"
          : "rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
      }
    >
      {label}
    </button>
  );
}
