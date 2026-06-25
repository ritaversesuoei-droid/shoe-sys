import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toWorkDate } from "@/lib/datekey";

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

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">配車表（流れ表）</h1>
          <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={day} min={earliest?.plan_date ?? undefined} max={latest?.plan_date ?? undefined} className="rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-white">表示</button>
        </form>
      </header>

      <p className="mb-3 text-sm text-slate-500">
        {day}　全{rows.length}件（自社{own} / 子車{sub}）
        {earliest?.plan_date && latest?.plan_date && (
          <span className="ml-2 text-xs text-slate-400">データ範囲: {earliest.plan_date} 〜 {latest.plan_date}</span>
        )}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-400">{day} の配車データがありません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2 whitespace-nowrap">所属</th>
                <th className="p-2 whitespace-nowrap">ドライバー</th>
                <th className="p-2 whitespace-nowrap">車両</th>
                <th className="p-2 whitespace-nowrap">荷主</th>
                <th className="p-2">着荷地</th>
                <th className="p-2 whitespace-nowrap">高速</th>
                <th className="p-2">備考</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.drivers as { name: string } | null;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${r.is_subcontract ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700"}`}>
                        {r.is_subcontract ? "子車" : "自社"}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap font-medium">{d?.name ?? r.driver_name_raw ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{r.vehicle_no ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{r.shipper ?? "—"}</td>
                    <td className="p-2">{r.delivery_spot ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{r.highway_instruction ?? ""}</td>
                    <td className="p-2 text-xs text-slate-500 max-w-[20rem]">{r.note ?? ""}</td>
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
