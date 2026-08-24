import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWorkDate } from "@/lib/datekey";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  plan_date: string;
  arrival_date: string | null;
  vehicle_no: string | null;
  shipper: string | null;
  origin_spot: string | null;
  delivery_spot: string | null;
  arrival_time: string | null;
  driver_id: string | null;
  driver_name_raw: string | null;
}

function mdw(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${w})`;
}

/**
 * ドライバー用「自分の配車」。ログイン中の本人ぶんだけを表示（他人の配車は見えない）。
 * 管理者の配車表と同じカードUI・スマホ最適化。編集/印刷/同期などの管理操作は無し。
 */
export default async function DriverDispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");

  const sb = createAdminClient();
  const { data: drv } = await sb.from("drivers").select("name").eq("id", ctx.driverId).maybeSingle();
  const name = drv?.name ?? "";

  const { date } = await searchParams;
  const paramDay = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  let day = paramDay ?? toWorkDate(new Date());

  // 本人ぶんだけ抽出（driver_id 一致、または担当者名一致）
  const fetchMine = async (d: string): Promise<Row[]> => {
    const { data } = await sb
      .from("dispatch_plans")
      .select("id, plan_date, arrival_date, vehicle_no, shipper, origin_spot, delivery_spot, arrival_time, driver_id, driver_name_raw")
      .eq("plan_date", d)
      .order("sort_no", { ascending: true, nullsFirst: false });
    // 本人抽出: driver_id 一致が基本。氏名一致は driver_id 未解決(子車等)の行に限定し、
    // 同名の別ドライバー（driver_id保有）の行を拾わないようにする。
    return ((data ?? []) as Row[]).filter(
      (r) => r.driver_id === ctx.driverId || (!!name && !r.driver_id && r.driver_name_raw === name),
    );
  };

  let rows = await fetchMine(day);
  // 既定表示(今日)に自分の配車が無ければ、直近の配車日へ寄せる
  if (!paramDay && rows.length === 0) {
    const { data: up } = await sb
      .from("dispatch_plans")
      .select("plan_date")
      .eq("driver_id", ctx.driverId)
      .gte("plan_date", day)
      .order("plan_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const near =
      up?.plan_date ??
      (
        await sb
          .from("dispatch_plans")
          .select("plan_date")
          .eq("driver_id", ctx.driverId)
          .order("plan_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data?.plan_date;
    if (near && near !== day) {
      day = near;
      rows = await fetchMine(day);
    }
  }

  const shift = (n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const today = toWorkDate(new Date());

  return (
    <main className="min-h-dvh bg-slate-100 p-3">
      <div className="mx-auto max-w-md">
        <header className="mb-3 flex items-center justify-between gap-2">
          <Link href="/driver" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 active:scale-95">← 戻る</Link>
          <h1 className="text-lg font-black text-slate-800">🚚 自分の配車</h1>
          <span className="max-w-[6rem] truncate text-sm font-bold text-blue-600">{name}</span>
        </header>

        {/* 日付ナビ */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href={`/driver/dispatch?date=${shift(-1)}`} className="rounded-xl bg-slate-200 px-4 py-2.5 text-base font-bold text-slate-700 active:scale-95">◀ 前日</Link>
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-slate-900">{mdw(day)}</span>
            {day !== today && (
              <Link href="/driver/dispatch" className="text-xs font-bold text-blue-600 underline">今日へ</Link>
            )}
          </div>
          <Link href={`/driver/dispatch?date=${shift(1)}`} className="rounded-xl bg-slate-200 px-4 py-2.5 text-base font-bold text-slate-700 active:scale-95">翌日 ▶</Link>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {mdw(day)} の配車はありません
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">積込日 {r.plan_date}</span>
                  {r.vehicle_no && (
                    <span className="rounded-lg border-2 border-slate-800 px-2 py-0.5 text-sm font-black text-slate-800">車 {r.vehicle_no}</span>
                  )}
                </div>
                <dl className="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 gap-y-2 text-[15px]">
                  <dt className="text-slate-400">荷主</dt>
                  <dd className="font-bold text-slate-800">{r.shipper || "—"}</dd>
                  <dt className="text-slate-400">積地</dt>
                  <dd className="break-words font-medium text-slate-800">{r.origin_spot || "—"}</dd>
                  <dt className="text-slate-400">着地</dt>
                  <dd className="break-words font-medium text-slate-800">{r.delivery_spot || "—"}</dd>
                  <dt className="text-slate-400">着日</dt>
                  <dd className="text-slate-800">{r.arrival_date || "—"}</dd>
                  <dt className="text-slate-400">時間</dt>
                  <dd className="font-bold text-slate-800">{r.arrival_time || "—"}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">あなた（{name}）の配車のみを表示しています。</p>
      </div>
    </main>
  );
}
