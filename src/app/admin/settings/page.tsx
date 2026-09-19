import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEarlyGraceMin } from "@/lib/operations/attendance-instruction";
import { ComplianceSettings } from "@/components/admin/ComplianceSettings";
import { AttendanceSettings } from "@/components/admin/AttendanceSettings";
import { BroadcastForm } from "@/components/admin/BroadcastForm";
import { RichMenuButton } from "@/components/admin/RichMenuButton";

export const dynamic = "force-dynamic";

/** 設定（改善基準告示パラメータ・出勤アラート・LINE上限）。管理者のみ（仕様書 12.2-#5 構成管理）。 */
export default async function SettingsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const supabase = await createClient();
  const graceMin = await getEarlyGraceMin(supabase);

  return (
    <main className="mx-auto max-w-3xl p-3 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">設定（改善基準告示）</h1>
        <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
      </header>
      <ComplianceSettings />
      <AttendanceSettings initialGraceMin={graceMin} />
      <BroadcastForm />
      <RichMenuButton />
    </main>
  );
}
