import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDispatchConfirmed } from "@/lib/operations/dispatch-confirm";
import { toWorkDate } from "@/lib/datekey";
import { DispatchSyncButton } from "@/components/admin/DispatchSyncButton";
import { MirrorButton } from "@/components/admin/MirrorButton";
import { WritebackButton } from "@/components/admin/WritebackButton";
import { PrintButton } from "@/components/admin/PrintButton";
import { DispatchTable } from "@/components/admin/DispatchTable";

export const dynamic = "force-dynamic";

/**
 * 配車表（運行データ / 流れ表 / F-09）。日付で配車予定を一覧（自社/子車・荷主・着荷地・高速指示・備考）。
 * 現行スプレッドシートの「流れ表」に相当。データは移行済み dispatch_plans。
 */
export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; driver?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const supabase = await createClient();

  // 既定日: 指定が無ければ最新の配車日（データのある日）を表示
  const { data: latest } = await supabase
    .from("dispatch_plans")
    .select("plan_date")
    .order("plan_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: earliest } = await supabase
    .from("dispatch_plans")
    .select("plan_date")
    .order("plan_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { date, driver } = await searchParams;
  const paramDay = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  // 既定日は「今日」（流れ表と揃える＝確定の連動を分かりやすく）。今日に配車が無ければ最新日にフォールバック。
  let day = paramDay ?? toWorkDate(new Date());

  const selectPlans = (d: string) =>
    supabase
      .from("dispatch_plans")
      .select("id, plan_date, arrival_date, driver_name_raw, vehicle_no, shipper, origin_spot, delivery_spot, arrival_time, is_subcontract, sort_no, drivers(name)")
      .eq("plan_date", d)
      .order("is_subcontract", { ascending: true })
      .order("sort_no", { ascending: true, nullsFirst: false })
      .order("driver_name_raw", { ascending: true });

  let { data: plans } = await selectPlans(day);
  if (!paramDay && (plans?.length ?? 0) === 0 && latest?.plan_date && latest.plan_date !== day) {
    day = latest.plan_date;
    ({ data: plans } = await selectPlans(day));
  }

  const confirmed = await isDispatchConfirmed(createAdminClient(), day);

  const nameOf = (r: { drivers: unknown; driver_name_raw: string | null }): string =>
    (r.drivers as { name: string } | null)?.name ?? r.driver_name_raw ?? "（担当者未定）";
  const allRows = plans ?? [];
  // 担当者プルダウン用（当日の担当者一覧）
  const driverNames = [...new Set(allRows.map(nameOf))].sort((a, b) => a.localeCompare(b, "ja"));
  const rows = driver ? allRows.filter((r) => nameOf(r) === driver) : allRows;
  const own = rows.filter((r) => !r.is_subcontract).length;
  const sub = rows.length - own;

  const shift = (n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return (
    <main className="w-full p-3 sm:p-6">
      {/* 印刷時: ナビ非表示・A4横 */}
      <style>{`@media print { nav { display: none !important; } @page { size: A4 landscape; margin: 8mm; } main { padding: 0 !important; max-width: none !important; } }`}</style>

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          {/* タイトル帯: 流れ表で「確定」するとここが赤くなる */}
          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1 ${confirmed ? "bg-red-600 text-white" : ""}`}>
            <h1 className="text-2xl font-bold">配車表（流れ表）</h1>
            {confirmed && <span className="rounded bg-white px-2 py-0.5 text-xs font-black text-red-600">確定</span>}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
            <Link href={`/admin/logiflow?date=${day}`} className="text-sm text-cyan-700">🗺️ 流れ表（確定はこちら）</Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MirrorButton />
          <DispatchSyncButton />
          <WritebackButton endpoint="/api/admin/dispatch/writeback" body={{ date: day }} label="📤 シートへ反映" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 担当者プルダウン（個人の配車の流れを表示） */}
          <form method="GET" className="flex items-center gap-1">
            <input type="hidden" name="date" value={day} />
            <select name="driver" defaultValue={driver ?? ""} className="rounded-lg border border-slate-300 px-3 py-3 text-base">
              <option value="">担当者：全員</option>
              {driverNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="submit" className="rounded-xl bg-slate-700 px-3 py-3 text-sm font-bold text-white">絞込</button>
          </form>
          <PrintButton label="🖨️ A4印刷" />
          <Link href={`/admin/dispatch?date=${shift(-1)}${driver ? `&driver=${encodeURIComponent(driver)}` : ""}`} className="rounded-xl bg-slate-200 px-4 py-3 text-base font-bold text-slate-700 hover:bg-slate-300">◀ 前日</Link>
          <form method="GET" className="flex items-center gap-2">
            {driver && <input type="hidden" name="driver" value={driver} />}
            <input type="date" name="date" defaultValue={day} min={earliest?.plan_date ?? undefined} max={latest?.plan_date ?? undefined} className="rounded-lg border border-slate-300 px-3 py-3 text-base" />
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-base font-bold text-white">表示</button>
          </form>
          <Link href={`/admin/dispatch?date=${shift(1)}${driver ? `&driver=${encodeURIComponent(driver)}` : ""}`} className="rounded-xl bg-slate-200 px-4 py-3 text-base font-bold text-slate-700 hover:bg-slate-300">翌日 ▶</Link>
        </div>
      </header>

      {/* 印刷用タイトル（画面では非表示） */}
      <div className="mb-2 hidden print:block">
        <h1 className="text-xl font-bold">配車表（流れ表）　{day}</h1>
        <p className="text-xs text-slate-500">全{rows.length}件（自社{own} / 子車{sub}）</p>
      </div>

      <p className="mb-3 text-sm text-slate-500">
        {day}　全{rows.length}件（自社{own} / 子車{sub}）
        {earliest?.plan_date && latest?.plan_date && (
          <span className="ml-2 text-xs text-slate-400">データ範囲: {earliest.plan_date} 〜 {latest.plan_date}</span>
        )}
      </p>

      <DispatchTable
        date={day}
        confirmed={confirmed}
        now={new Date().toISOString()}
        rows={rows.map((r) => ({
          id: r.id,
          driver_name_raw: r.driver_name_raw,
          driver_name: (r.drivers as { name: string } | null)?.name ?? null,
          vehicle_no: r.vehicle_no,
          shipper: r.shipper,
          origin_spot: r.origin_spot,
          delivery_spot: r.delivery_spot,
          arrival_date: r.arrival_date,
          arrival_time: r.arrival_time,
          is_subcontract: r.is_subcontract,
        }))}
      />
    </main>
  );
}
