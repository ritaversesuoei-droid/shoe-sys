import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";
import { holidaysOfYear, type DayClass } from "@/lib/holidays";
import { to_month_key } from "@/lib/datekey";
import HolidayManager from "@/components/admin/HolidayManager";

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

  // 休日設定（当月の祝日＋手修正）
  const mm = monthKey.slice(4, 6);
  const monthHolidays = Array.from(holidaysOfYear(Number(monthKey.slice(0, 4))).entries())
    .filter(([d]) => d.slice(5, 7) === mm)
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const { data: ovRow } = await supabase.from("app_settings").select("value").eq("key", "holiday_overrides").maybeSingle();
  const overrides = (ovRow?.value as Record<string, DayClass>) ?? {};

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
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="p-3">ドライバー</th>
                <th className="p-3 text-right">出勤</th>
                <th className="p-3 text-right">拘束</th>
                <th className="p-3 text-right">労働</th>
                <th className="p-3 text-right">残業</th>
                <th className="p-3 text-right">休日</th>
                <th className="p-3 text-right">深夜</th>
                <th className="p-3 text-center">違反</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const partner = !s.manageAttendance; // 協力店社（勤怠集計・労働チェック対象外）
                return (
                <tr key={s.driverId} className={`border-t ${partner ? "bg-slate-50 text-slate-400" : s.violationCount > 0 ? "bg-rose-50" : ""}`}>
                  <td className="p-3">
                    <Link href={`/admin/attendance?month=${monthKey}&driver=${s.driverId}`} className={`font-bold hover:underline ${partner ? "text-slate-500" : "text-blue-700"}`}>
                      {s.driverName}
                    </Link>
                    <span className="ml-1 text-xs text-slate-400">{s.driverCode}</span>
                    {partner && <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">協力・集計対象外</span>}
                  </td>
                  <td className="p-3 text-right">{s.workDays}日</td>
                  <td className="p-3 text-right font-mono">{hm(s.restraintMin)}</td>
                  <td className="p-3 text-right font-mono">{hm(s.laborMin)}</td>
                  <td className="p-3 text-right font-mono">{partner ? "—" : hm(s.overtimeMin)}</td>
                  <td className="p-3 text-right font-mono">{partner ? "—" : hm(s.holidayWorkMin)}</td>
                  <td className="p-3 text-right font-mono">{hm(s.nightMin)}</td>
                  <td className="p-3 text-center">
                    {partner
                      ? <span className="text-xs text-slate-400">対象外</span>
                      : s.violationCount > 0
                      ? <span className="inline-block rounded-full bg-rose-600 px-2.5 py-1 text-sm font-bold text-white">⚠️ {s.violationCount}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        残業=労働−所定(8h)の累計、休日労働=休日(土日・祝日・手修正)の労働。時刻は H:MM。
        <br />協力店社（🏢自社以外）は勤怠集計・労働チェックの対象外です（打刻履歴のみ・残業/休日/違反は算定しません）。
      </p>

      <HolidayManager month={monthKey} holidays={monthHolidays} initialOverrides={overrides} />
    </main>
  );
}
