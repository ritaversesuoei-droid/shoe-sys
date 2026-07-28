import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toWorkDate } from "@/lib/datekey";
import { DispatchSyncButton } from "@/components/admin/DispatchSyncButton";
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
  searchParams: Promise<{ date?: string }>;
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

  const { date } = await searchParams;
  const day = (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) ?? latest?.plan_date ?? toWorkDate(new Date());

  const { data: plans } = await supabase
    .from("dispatch_plans")
    .select("id, plan_date, driver_name_raw, vehicle_no, shipper, delivery_spot, highway_instruction, is_subcontract, note, drivers(name)")
    .eq("plan_date", day)
    .order("is_subcontract", { ascending: true })
    .order("driver_name_raw", { ascending: true });

  const rows = plans ?? [];
  const own = rows.filter((r) => !r.is_subcontract).length;
  const sub = rows.length - own;

  const shift = (n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return (
    <main className="mx-auto max-w-7xl p-6">
      {/* 印刷時: ナビ非表示・A4横 */}
      <style>{`@media print { nav { display: none !important; } @page { size: A4 landscape; margin: 8mm; } main { padding: 0 !important; max-width: none !important; } }`}</style>

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">配車表（流れ表）</h1>
          <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-xs text-slate-400">データ源: TROUD（流れ表シート）。取込は同期ボタンを押したときだけ・自動反映なし</p>
          </div>
        </div>
        <DispatchSyncButton />
        <div className="flex items-center gap-2">
          <PrintButton label="🖨️ A4印刷" />
          <Link href={`/admin/dispatch?date=${shift(-1)}`} className="rounded-xl bg-slate-200 px-4 py-3 text-base font-bold text-slate-700 hover:bg-slate-300">◀ 前日</Link>
          <form method="GET" className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={day} min={earliest?.plan_date ?? undefined} max={latest?.plan_date ?? undefined} className="rounded-lg border border-slate-300 px-3 py-3 text-base" />
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-base font-bold text-white">表示</button>
          </form>
          <Link href={`/admin/dispatch?date=${shift(1)}`} className="rounded-xl bg-slate-200 px-4 py-3 text-base font-bold text-slate-700 hover:bg-slate-300">翌日 ▶</Link>
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
        rows={rows.map((r) => ({
          id: r.id,
          driver_name_raw: r.driver_name_raw,
          driver_name: (r.drivers as { name: string } | null)?.name ?? null,
          vehicle_no: r.vehicle_no,
          shipper: r.shipper,
          delivery_spot: r.delivery_spot,
          highway_instruction: r.highway_instruction,
          is_subcontract: r.is_subcontract,
          note: r.note,
        }))}
      />
    </main>
  );
}
