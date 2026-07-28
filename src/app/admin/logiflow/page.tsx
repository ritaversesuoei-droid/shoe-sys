import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLogiFlowBoard } from "@/lib/operations/logiflow";
import { toWorkDate } from "@/lib/datekey";
import { LogiFlowBoard } from "@/components/admin/LogiFlowBoard";

export const dynamic = "force-dynamic";

/**
 * LOGI-FLOW NAVI（流れ表 編集画面 / F-09拡張）。現行GASの再現。
 * ドライバー行 × AM/当日フロー/翌日。案件のドラッグ並替・翌日送り・その場編集・詳細モーダル。
 */
export default async function LogiFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toWorkDate(new Date());

  const admin = createAdminClient();
  const board = await getLogiFlowBoard(admin, day);

  const shift = (n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return (
    <LogiFlowBoard
      date={day}
      drivers={board.drivers}
      totalJobs={board.totalJobs}
      prevDate={shift(-1)}
      nextDate={shift(1)}
    />
  );
}
