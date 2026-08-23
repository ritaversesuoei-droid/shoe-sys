"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initLiff } from "@/lib/line/liff";
import { clientEnv } from "@/lib/env";

/**
 * ドライバー専用ログイン（S-01）。
 *   - 配布したログインID（例: driver10）＋パスワードでログイン（Excel配布）。
 *   - セッションはcookieで保持され自動更新されるため、一度ログインすれば次回から自動ログイン。
 *   - LINE(LIFF)は設定後に併用可（下部の小ボタン）。
 */
const DRIVER_DOMAIN = "drivers.shoei.local";

export function DriverLogin() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"id" | "liff" | null>(null);

  async function idLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading("id");
    setError(null);
    const id = loginId.trim();
    const email = id.includes("@") ? id : `${id}@${DRIVER_DOMAIN}`;
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) return setError("ログインIDまたはパスワードが違います。");
    router.refresh();
  }

  async function liffLogin() {
    setLoading("liff");
    setError(null);
    try {
      const liffId = clientEnv.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) throw new Error("LINEログインは準備中です（ID/パスワードでログインしてください）");
      const session = await initLiff(liffId);
      if (!session) return; // login()でリダイレクト
      const res = await fetch("/api/auth/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: session.idToken }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "LINE認証に失敗しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-6xl">🚚</div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">ドライバー ログイン</h1>
        <p className="mt-1 text-sm text-slate-500">昭栄運輸 運行・勤怠</p>
      </div>

      <form onSubmit={idLogin} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-sm font-bold text-slate-600">ログインID</span>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="例: driver10"
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-600">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
          />
        </label>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading !== null}
          className="rounded-2xl bg-blue-600 px-4 py-4 text-xl font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          {loading === "id" ? "ログイン中…" : "ログイン"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400">
        一度ログインすると、次回からは自動でログインされます（毎回の入力は不要）。
      </p>

      <div className="flex items-center gap-3 text-xs text-slate-300">
        <div className="h-px flex-1 bg-slate-200" />
        または
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <button
        onClick={liffLogin}
        disabled={loading !== null}
        className="rounded-xl bg-[#06C755] px-4 py-3 font-bold text-white disabled:opacity-50"
      >
        {loading === "liff" ? "認証中…" : "LINEでログイン"}
      </button>
    </main>
  );
}
