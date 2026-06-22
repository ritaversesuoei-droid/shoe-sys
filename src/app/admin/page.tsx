import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

/**
 * 運行管理ダッシュボード（S-10 / 仕様書 F-15）。
 * 本フェーズは認証ガードと導線の雛形のみ。タイムライン/Realtime は次フェーズ。
 */
export default async function AdminHome() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") {
    return (
      <main className="p-6">
        <p className="text-red-600">管理者権限がありません。</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">運行管理ダッシュボード</h1>
      <p className="mt-1 text-sm text-slate-500">
        ようこそ {ctx.displayName ?? "管理者"} さん
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        <li className="rounded-lg border p-4">本日の運行盤面（F-15）— 次フェーズ</li>
        <li className="rounded-lg border p-4">警告まとめ・是正（F-13）— 次フェーズ</li>
        <li className="rounded-lg border p-4">月次集計（F-14）— 次フェーズ</li>
        <li className="rounded-lg border p-4">時刻修正（F-19）— 次フェーズ</li>
      </ul>
    </main>
  );
}
