"use client";

import Link from "next/link";

/**
 * ルートエラーバウンダリ。Server/Client の実行時エラーを捕捉し、生のスタックではなく
 * 日本語の案内＋再試行を表示する。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-sm text-slate-500">
        一時的な問題の可能性があります。再試行してください。
        {error.digest && <span className="mt-1 block text-xs text-slate-400">参照: {error.digest}</span>}
      </p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
          再試行
        </button>
        <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 font-medium">
          トップへ
        </Link>
      </div>
    </main>
  );
}
