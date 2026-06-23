import Link from "next/link";

/**
 * トップ（入口）。
 * 実運用ではアクター別に振り分ける:
 *  - ドライバー: LIFF 経由で /driver へ（LINEログイン）
 *  - 管理者:     /admin へ（Supabase Auth）
 *  - 据置端末:   /office へ（端末認証）
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">昭栄運輸 運行・勤怠管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          運行打刻・勤怠集計・改善基準告示判定
        </p>
      </div>
      <nav className="flex flex-col gap-3">
        <Link
          href="/driver"
          className="rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
        >
          ドライバー（スマホ / LIFF）
        </Link>
        <Link
          href="/office"
          className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium"
        >
          据置端末（事務所）
        </Link>
        <Link
          href="/admin"
          className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium"
        >
          運行管理者
        </Link>
      </nav>
    </main>
  );
}
