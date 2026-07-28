"use client";

/** 画面をそのままブラウザ印刷（A4）する汎用ボタン。print:hidden で自身は印刷対象外。 */
export function PrintButton({ label = "🖨️ 印刷", className = "" }: { label?: string; className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={className || "rounded-xl bg-slate-700 px-4 py-3 text-base font-bold text-white hover:bg-slate-800"}
    >
      {label}
    </button>
  );
}
