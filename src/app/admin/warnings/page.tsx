import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { WarningList } from "@/components/admin/WarningList";

export const dynamic = "force-dynamic";

/**
 * 警告まとめ・是正登録（仕様書 F-13）。違反一覧の確認と是正理由の登録（ソフト解消）。
 */
export default async function WarningsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">警告まとめ・是正</h1>
        <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
      </header>
      <WarningList />
    </main>
  );
}
