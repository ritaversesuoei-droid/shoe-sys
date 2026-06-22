import Link from "next/link";

/** 404 ページ。 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-sm text-slate-500">ページが見つかりませんでした。</p>
      <Link href="/" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
        トップへ
      </Link>
    </main>
  );
}
