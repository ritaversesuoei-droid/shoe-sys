"use client";

import { useState } from "react";

/** 連携済み全ドライバーへLINEで一斉配信（一斉周知）。管理者のみ。 */
export function BroadcastForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) return;
    if (!confirm("連携済みの全ドライバーへ送信します。よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/line/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "送信に失敗しました");
      setMsg(d.sent > 0 ? `✓ ${d.sent}名へ送信しました` : (d.note ?? "送信対象がいませんでした"));
      if (d.sent > 0) setMessage("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 p-5">
      <h2 className="text-lg font-bold">📢 LINE 一斉配信</h2>
      <p className="mt-1 text-sm text-slate-500">
        LINE連携済みの全ドライバーへお知らせを送ります。※通知の使用量（当月）に計上されます。
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="例）明日は全車オイル点検日です。出庫前に点検をお願いします。"
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{message.length}/1000</span>
        <button
          onClick={send}
          disabled={busy || !message.trim()}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "送信中…" : "全ドライバーへ送信"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm font-medium text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
