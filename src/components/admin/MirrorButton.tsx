"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 並行運用ミラーを手動実行するボタン（現行スプレッドシート → shoei-sys 全同期）。
 * 通常は1時間ごとに自動実行されるが、今すぐ取り込みたいときに使う。
 */
export function MirrorButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/mirror", { method: "POST" });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "同期に失敗しました");
      if (d.configured === false) {
        setErr(d.note ?? "ミラーが未設定です（環境変数 MIRROR_* を設定してください）");
      } else {
        const parts = [
          d.shiftsInserted != null ? `勤務+${d.shiftsInserted}` : null,
          d.events != null ? `打刻+${d.events}` : null,
          d.dispatchReplaced != null ? `配車${d.dispatchReplaced}` : null,
          d.recomputed != null ? `再計算${d.recomputed}` : null,
        ].filter(Boolean);
        setMsg(`✓ 全同期 完了（直近${d.windowDays}日）: ${parts.join(" / ") || "変更なし"}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-xl bg-indigo-600 px-4 py-3 text-base font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        title="現行スプレッドシート（勤怠・打刻・配車）を今すぐ取り込みます"
      >
        {busy ? "全同期中…" : "🔁 現行から全同期"}
      </button>
      {msg && <span className="max-w-[20rem] text-right text-xs font-medium text-indigo-700">{msg}</span>}
      {err && <span className="max-w-[20rem] text-right text-xs text-red-600">{err}</span>}
    </div>
  );
}
