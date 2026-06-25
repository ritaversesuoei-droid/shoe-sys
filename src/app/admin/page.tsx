import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTodayBoard, type BoardStatus } from "@/lib/operations/board";
import { to_month_key, toWorkDate } from "@/lib/datekey";
import { RealtimeRefresh } from "@/components/admin/RealtimeRefresh";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<BoardStatus, { label: string; cls: string }> = {
  active: { label: "稼働中", cls: "bg-green-100 text-green-800 border-green-300" },
  rest: { label: "休息", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  done: { label: "終業", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  idle: { label: "待機", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

function hhmm(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * 運行管理ダッシュボード（仕様書 F-15）。
 * 本日の運行盤面（状態色分け）・警告まとめ・LINE通知残数を表示。Realtimeで即時反映。
 */
export default async function AdminHome() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") {
    return (
      <main className="p-6">
        <p className="text-red-600">管理者権限がありません。</p>
      </main>
    );
  }

  const supabase = await createClient();
  const today = toWorkDate(new Date());
  const monthKey = to_month_key(new Date());

  const [board, warnings, usage] = await Promise.all([
    getTodayBoard(supabase, today),
    supabase
      .from("compliance_alerts")
      .select("id, work_date, alert_types, drivers(code, name)")
      .eq("status", "open")
      .order("work_date", { ascending: false })
      .limit(20),
    supabase.from("line_usage").select("sent_count, limit_count").eq("month_key", monthKey).maybeSingle(),
  ]);

  const warningRows = warnings.data ?? [];
  const sent = usage.data?.sent_count ?? 0;
  const limit = usage.data?.limit_count ?? null;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <RealtimeRefresh />
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">運行管理ダッシュボード</h1>
          <p className="text-sm text-slate-500">
            {today}（{ctx.displayName ?? "管理者"}）
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/attendance" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            勤怠修正 →
          </Link>
          <Link href="/admin/monthly" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            月次集計 →
          </Link>
          <Link href="/admin/masters" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            マスタ管理 →
          </Link>
          <Link href="/admin/settings" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            設定 →
          </Link>
          <div className="text-right text-sm">
            <div className="text-slate-500">LINE通知 当月</div>
            <div className="font-bold">
              {sent}
              {limit != null ? ` / ${limit}` : ""} 件
            </div>
          </div>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">本日の運行盤面</h2>
        {board.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-slate-400">
            本日の打刻はまだありません
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {board.map((b) => {
              const s = STATUS_STYLE[b.status];
              return (
                <div key={b.driverId} className="rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold">{b.driverName}</div>
                      <div className="text-xs text-slate-500">
                        {b.driverCode} / {b.vehicleNo ?? "車番未設定"}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-3 text-sm">
                    <span className="font-medium">{b.lastEventLabel}</span>
                    <span className="ml-2 text-slate-500">{hhmm(b.lastAt)}</span>
                  </div>
                  {b.address && <div className="mt-1 truncate text-xs text-slate-400">📍 {b.address}</div>}
                  <div className="mt-1 text-xs text-slate-400">打刻 {b.eventCount} 件</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          未対応の警告（改善基準告示）
          <span className="text-sm font-normal text-slate-500">{warningRows.length} 件</span>
          <Link href="/admin/warnings" className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium">
            是正登録 →
          </Link>
        </h2>
        {warningRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-slate-400">
            未対応の警告はありません
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {warningRows.map((w) => {
              const d = w.drivers as { code: string; name: string } | null;
              return (
                <li key={w.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    <span className="font-medium">{d?.name ?? "(不明)"}</span>
                    <span className="ml-2 text-slate-500">{w.work_date}</span>
                  </span>
                  <span className="flex gap-1">
                    {(w.alert_types ?? []).map((t) => (
                      <span key={t} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        {t}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
