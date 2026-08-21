"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** システムの内容をスプレッドシートへ書き戻すボタン（GAS Web App 経由）。 */
export function WritebackButton({
  endpoint,
  body,
  label = "📤 スプレッドシートへ反映",
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!confirm("システムの内容をスプレッドシートへ書き戻します。\n（シート側の同じ範囲は上書きされます）よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.success) {
        throw new Error(res.status === 503 ? "書き戻し先（GAS Web App）が未設定です" : d.error ?? "失敗しました");
      }
      setMsg(`✓ 反映しました${d.applied != null ? `（${d.applied}件）` : d.rows != null ? `（${d.rows}件）` : d.updates != null ? `（${d.updates}件）` : ""}`);
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
        className="rounded-xl bg-purple-600 px-4 py-3 text-base font-bold text-white hover:bg-purple-700 disabled:opacity-50"
        title="この画面の内容をスプレッドシートに書き戻します"
      >
        {busy ? "反映中…" : label}
      </button>
      {msg && <span className="max-w-[16rem] text-right text-xs font-medium text-purple-700">{msg}</span>}
      {err && <span className="max-w-[16rem] text-right text-xs text-red-600">{err}</span>}
    </div>
  );
}
