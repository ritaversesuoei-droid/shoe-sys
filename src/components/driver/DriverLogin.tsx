"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initLiff } from "@/lib/line/liff";
import { clientEnv } from "@/lib/env";

/**
 * ドライバーログイン（仕様書 F-01）。
 *  - 本番: LINEログイン（LIFF）→ /api/auth/line でセッション確立
 *  - 開発: メール/パスワード（Supabase Auth 直接）
 */
export function DriverLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"dev" | "liff" | null>(null);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading("dev");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function liffLogin() {
    setLoading("liff");
    setError(null);
    try {
      const liffId = clientEnv.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) throw new Error("LIFF未設定です（NEXT_PUBLIC_LIFF_ID）");
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
      <div>
        <h1 className="text-xl font-bold">ドライバー ログイン</h1>
        <p className="mt-1 text-sm text-slate-500">庄栄運輸 運行・勤怠</p>
      </div>

      <button
        onClick={liffLogin}
        disabled={loading !== null}
        className="rounded-lg bg-[#06C755] px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {loading === "liff" ? "認証中..." : "LINEでログイン"}
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        開発用ログイン
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={devLogin} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading !== null}
          className="rounded-lg border border-slate-900 px-4 py-2 font-medium disabled:opacity-50"
        >
          {loading === "dev" ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </main>
  );
}
