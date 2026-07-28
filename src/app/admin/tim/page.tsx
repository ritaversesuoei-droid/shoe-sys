import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTimBoard } from "@/lib/operations/tim-board";
import { to_month_key, toWorkDate } from "@/lib/datekey";
import { TimBoard } from "@/components/admin/TimBoard";

export const dynamic = "force-dynamic";

/**
 * T・I・M 運行管理パネル（現行GAS「T・I・M」の再現 / F-15拡張）。
 * 行＝ドライバー、右＝当日の打刻タイムライン。Supabase Realtime で即時反映。
 */
export default async function TimPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toWorkDate(new Date());

  const supabase = await createClient();
  const [rows, usage] = await Promise.all([
    getTimBoard(supabase, day),
    supabase
      .from("line_usage")
      .select("sent_count, limit_count")
      .eq("month_key", to_month_key(new Date(`${day}T00:00:00+09:00`)))
      .maybeSingle(),
  ]);

  const shiftDay = (n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return (
    <TimBoard
      day={day}
      rows={rows}
      prevDay={shiftDay(-1)}
      nextDay={shiftDay(1)}
      lineSent={usage.data?.sent_count ?? 0}
      lineLimit={usage.data?.limit_count ?? null}
    />
  );
}
