import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { MasterManager } from "@/components/admin/MasterManager";

export const dynamic = "force-dynamic";

/** マスタ管理（管理者）。ドライバー・車両の追加/編集/在籍切替。 */
export default async function MastersPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">マスタ管理</h1>
        <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
      </header>
      <MasterManager />
    </main>
  );
}
