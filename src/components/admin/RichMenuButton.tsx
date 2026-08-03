"use client";

import { useState } from "react";

/** ドライバー向けリッチメニューを作成・既定設定する（管理者操作）。 */
export function RichMenuButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!confirm("公式LINEにドライバー用リッチメニューを設定します。よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/line/richmenu", { method: "POST" });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "設定に失敗しました");
      setMsg(`✓ 設定しました（リンク先: ${d.liff ? "LIFF" : "公開URL"} / id: ${String(d.richMenuId).slice(0, 10)}…）`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 p-5">
      <h2 className="text-lg font-bold">📱 リッチメニュー</h2>
      <p className="mt-1 text-sm text-slate-500">
        公式LINE下部に「出勤・到着・退勤・積込・荷卸・日報」のショートカットを設定します。
        ※LIFF未設定時は公開URLに遷移します（本人のLINEログインが前提の画面あり）。
      </p>
      <button
        onClick={run}
        disabled={busy}
        className="mt-3 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "設定中…" : "リッチメニューを設定"}
      </button>
      {msg && <p className="mt-2 text-sm font-medium text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
