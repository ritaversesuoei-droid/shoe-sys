"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 流れ表シート → dispatch_plans を最新化する管理者ボタン（/admin/dispatch）。 */
export function DispatchSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/dispatch/sync", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "同期に失敗しました");
      setMsg(`✓ ${data.replaced}件を反映（${data.from ?? "-"}〜${data.to ?? "-"}）`);
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
        onClick={sync}
        disabled={busy}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "同期中…" : "🔄 シートから最新に同期"}
      </button>
      {msg && <span className="text-xs font-medium text-emerald-700">{msg}</span>}
      {err && <span className="max-w-[16rem] text-right text-xs text-red-600">{err}</span>}
    </div>
  );
}
