import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { to_month_key } from "@/lib/datekey";
import AttendanceTable, { type AttendanceRow } from "@/components/admin/AttendanceTable";

export const dynamic = "force-dynamic";

function normalizeMonth(v: string | undefined): string {
  if (!v) return to_month_key(new Date());
  const digits = v.replace(/-/g, "");
  return /^\d{6}$/.test(digits) ? digits : to_month_key(new Date());
}

/**
 * 勤怠修正（修正入力 / F-19）。月・ドライバーで確定勤務を一覧し、出退勤・補正・休憩・理由を
 * 行内編集 → 保存で拘束/労働/深夜と違反を再計算（週起算は日曜）。
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; driver?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const { month, driver } = await searchParams;
  const monthKey = normalizeMonth(month);
  const monthInput = `${monthKey.slice(0, 4)}-${monthKey.slice(4)}`;

  const supabase = await createClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code");

  let q = supabase
    .from("shifts")
    .select(
      "id, work_date, actual_in, actual_out, edited_in, edited_out, edited_in_adj_days, edited_out_adj_days, rest_time, restraint_min, labor_min, night_min, warn_restraint, warn_rest, revision_status, revision_reason, crew_type, ferry_min, split_rest, clock_in_at, clock_out_at, drivers(code, name)",
    )
    .eq("month_key", monthKey)
    .order("work_date", { ascending: true });
  if (driver) q = q.eq("driver_id", driver);
  const { data: shifts } = await q;

  // 確定時刻(timestamptz)から JST の HH:MM:SS を得る（打刻由来で actual_in/out が無い勤務の既定値補完用）
  const jstTime = (iso: string | null): string | null =>
    iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : null;

  const rows: AttendanceRow[] = (shifts ?? []).map((s) => {
    const d = s.drivers as { code: string; name: string } | null;
    return {
      id: s.id,
      workDate: s.work_date,
      driverName: d?.name ?? "(不明)",
      driverCode: d?.code ?? null,
      actualIn: s.actual_in ?? jstTime(s.clock_in_at),
      actualOut: s.actual_out ?? jstTime(s.clock_out_at),
      editedIn: s.edited_in,
      editedOut: s.edited_out,
      inAdj: s.edited_in_adj_days,
      outAdj: s.edited_out_adj_days,
      restTime: s.rest_time,
      restraintMin: s.restraint_min,
      laborMin: s.labor_min,
      nightMin: s.night_min,
      warn: [s.warn_restraint, s.warn_rest].filter(Boolean).join(" / ") || null,
      revisionStatus: s.revision_status,
      revisionReason: s.revision_reason,
      closed: s.clock_out_at != null,
      crewType: s.crew_type ?? "single",
      ferryMin: s.ferry_min ?? 0,
      splitRest: s.split_rest ?? false,
    };
  });

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">勤怠修正（修正入力）</h1>
          <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
          <Link href={`/admin/monthly?month=${monthKey}`} className="ml-3 text-sm text-blue-600">月次集計 →</Link>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={monthInput} className="rounded-lg border border-slate-300 px-3 py-2" />
          <select name="driver" defaultValue={driver ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">全ドライバー</option>
            {(drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.code} {d.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-white">表示</button>
        </form>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-400">{monthKey} の勤務データがありません</p>
      ) : (
        <AttendanceTable rows={rows} />
      )}
      <p className="mt-3 text-xs text-slate-400">
        修正出勤/退勤(HH:MM)・補正(翌日=1)・休憩(分)・理由を編集し「保存」。拘束/労働/深夜・違反が再計算されます（週起算=日曜）。<br />
        <span className="text-amber-600">特例（2人乗務／フェリー乗船分／分割休息）は該当勤務のみ適用。改善基準告示の判定に反映されます（値は要社労士確認）。</span>
      </p>
    </main>
  );
}
