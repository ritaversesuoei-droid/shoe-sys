import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { to_month_key } from "@/lib/datekey";
import ReportPicker from "@/components/admin/ReportPicker";
import ReportPdfButton from "@/components/admin/ReportPdfButton";

export const dynamic = "force-dynamic";

function normalizeMonth(v: string | undefined): string {
  if (!v) return to_month_key(new Date());
  const digits = v.replace(/-/g, "");
  return /^\d{6}$/.test(digits) ? digits : to_month_key(new Date());
}
function monthRange(monthKey: string): { start: string; end: string } {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(4, 6));
  const p = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${p(m)}-01`, end: `${y}-${p(m)}-${p(last)}` };
}

/**
 * 日報の閲覧・印刷（印刷用日報 / F-17/18）。日付＋ドライバーでPDF表示、当月の提出済み日報を一覧。
 */
export default async function ReportsPage({
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
  const { start, end } = monthRange(monthKey);

  const supabase = await createClient();
  const { data: drivers } = await supabase.from("drivers").select("id, code, name").eq("is_active", true).order("code");
  // 既定日: 最新の勤務日（データのある日）
  const { data: latestShift } = await supabase.from("shifts").select("work_date").order("work_date", { ascending: false }).limit(1).maybeSingle();
  const defaultDate = latestShift?.work_date ?? `${monthKey.slice(0, 4)}-${monthKey.slice(4)}-01`;

  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, report_date, status, confirmed_at, vehicle_no, pdf_path, driver_id, drivers(code, name)")
    .gte("report_date", start)
    .lte("report_date", end)
    .order("report_date", { ascending: false });

  const rows = reports ?? [];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">日報（閲覧・印刷）</h1>
          <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={monthInput} className="rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-white">表示</button>
        </form>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold text-slate-700">日付・ドライバーを指定して表示</h2>
        <ReportPicker drivers={drivers ?? []} defaultDate={defaultDate} />
        <p className="mt-1 text-xs text-slate-400">当日の運行データ（出発〜退勤）から印刷用日報を生成します。</p>
      </section>

      <h2 className="mb-2 text-sm font-bold text-slate-700">提出済み日報（{monthInput}）</h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-400">当月の提出済み日報はまだありません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr><th className="p-2">日付</th><th className="p-2">ドライバー</th><th className="p-2">車番</th><th className="p-2">状態</th><th className="p-2">確定日時</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.drivers as { code: string; name: string } | null;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{r.report_date}</td>
                    <td className="p-2 whitespace-nowrap">{d?.name ?? "—"}<span className="ml-1 text-xs text-slate-400">{d?.code}</span></td>
                    <td className="p-2">{r.vehicle_no ?? "—"}</td>
                    <td className="p-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {r.status === "confirmed" ? "確定" : "下書き"}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs text-slate-500">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</td>
                    <td className="p-2"><ReportPdfButton date={r.report_date} driverId={r.driver_id} label="PDF" small /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
