import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";
import { to_month_key } from "@/lib/datekey";

export const dynamic = "force-dynamic";

function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "2026-06" or "202606" → "202606" */
function normalizeMonth(v: string | undefined): string {
  if (!v) return to_month_key(new Date());
  const digits = v.replace(/-/g, "");
  return /^\d{6}$/.test(digits) ? digits : to_month_key(new Date());
}

/**
 * 月次集計 管理画面（仕様書 F-14）。ドライバー別の月次サマリを表示。
 */
export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const { month } = await searchParams;
  const monthKey = normalizeMonth(month);
  const monthInput = `${monthKey.slice(0, 4)}-${monthKey.slice(4)}`;

  const supabase = await createClient();
  const summary = await getMonthlySummary(supabase, monthKey);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">月次集計</h1>
          <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={monthInput} className="rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-white">表示</button>
        </form>
      </header>

      {summary.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-400">
          {monthKey} の確定勤務データがありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">ドライバー</th>
                <th className="p-2 text-right">出勤日数</th>
                <th className="p-2 text-right">拘束</th>
                <th className="p-2 text-right">労働</th>
                <th className="p-2 text-right">残業</th>
                <th className="p-2 text-right">休日労働</th>
                <th className="p-2 text-right">深夜</th>
                <th className="p-2 text-right">違反</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.driverId} className="border-t">
                  <td className="p-2">
                    <span className="font-medium">{s.driverName}</span>
                    <span className="ml-1 text-xs text-slate-400">{s.driverCode}</span>
                  </td>
                  <td className="p-2 text-right">{s.workDays}</td>
                  <td className="p-2 text-right">{hm(s.restraintMin)}</td>
                  <td className="p-2 text-right">{hm(s.laborMin)}</td>
                  <td className="p-2 text-right">{hm(s.overtimeMin)}</td>
                  <td className="p-2 text-right">{hm(s.holidayWorkMin)}</td>
                  <td className="p-2 text-right">{hm(s.nightMin)}</td>
                  <td className={`p-2 text-right ${s.violationCount > 0 ? "font-bold text-red-600" : ""}`}>
                    {s.violationCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        残業=労働−所定(8h)の累計、休日労働=土日（祝日連携はTODO）。時刻は H:MM。
      </p>
    </main>
  );
}
