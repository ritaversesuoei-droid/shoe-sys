import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPhotoGallery } from "@/lib/operations/photo-gallery";
import { PhotoGallery } from "@/components/admin/PhotoGallery";

export const dynamic = "force-dynamic";

const TYPES: { v: string; l: string }[] = [
  { v: "", l: "すべての種別" },
  { v: "departure", l: "出勤" },
  { v: "arrival", l: "到着" },
  { v: "loading", l: "積込" },
  { v: "unloading", l: "荷卸" },
  { v: "leg_departure", l: "長距離再出発" },
  { v: "long_rest", l: "長距離休憩" },
  { v: "clock_out", l: "退勤" },
];

const p2 = (n: number) => String(n).padStart(2, "0");
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
function shiftDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function validDate(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * 打刻写真ギャラリー（管理）。期間・ドライバー・種別で検索。既定は当月1ヶ月。
 */
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; driver?: string; type?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/login");
  if (ctx.role !== "admin") return <main className="p-6 text-red-600">管理者権限が必要です。</main>;

  const sp = await searchParams;
  const driver = sp.driver || "";
  const type = sp.type || "";

  // JSTの今日・当月レンジ（既定=当月1ヶ月）
  const jd = new Date(Date.now() + 9 * 3600 * 1000);
  const firstOfMonth = new Date(Date.UTC(jd.getUTCFullYear(), jd.getUTCMonth(), 1));
  const lastOfMonth = new Date(Date.UTC(jd.getUTCFullYear(), jd.getUTCMonth() + 1, 0));
  const from = validDate(sp.from) ?? ymd(firstOfMonth);
  const to = validDate(sp.to) ?? ymd(lastOfMonth);

  // クイック期間プリセット（ドライバー・種別は保持）
  const dow = jd.getUTCDay();
  const monday = shiftDays(jd, -((dow + 6) % 7));
  const presets = [
    { l: "今日", from: ymd(jd), to: ymd(jd) },
    { l: "今週", from: ymd(monday), to: ymd(shiftDays(monday, 6)) },
    { l: "今月", from: ymd(firstOfMonth), to: ymd(lastOfMonth) },
    {
      l: "先月",
      from: ymd(new Date(Date.UTC(jd.getUTCFullYear(), jd.getUTCMonth() - 1, 1))),
      to: ymd(new Date(Date.UTC(jd.getUTCFullYear(), jd.getUTCMonth(), 0))),
    },
  ];
  const presetHref = (pf: string, pt: string) =>
    `/admin/photos?from=${pf}&to=${pt}${driver ? `&driver=${driver}` : ""}${type ? `&type=${type}` : ""}`;

  const supa = await createClient();
  const { data: drivers } = await supa.from("drivers").select("id, name, code").order("code", { ascending: true });

  // 署名URL発行のため service_role
  const admin = createAdminClient();
  const days = await getPhotoGallery(admin, { from, to, driverId: driver || undefined, eventType: type || undefined });
  const total = days.reduce((s, d) => s + d.count, 0);
  const selectedName = drivers?.find((d) => d.id === driver)?.name;
  const typeLabel = TYPES.find((t) => t.v === type)?.l ?? "すべての種別";

  return (
    <main className="mx-auto max-w-5xl p-3 sm:p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">写真（ドライバー別・期間・種別で検索）</h1>
        <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
      </header>

      {/* クイック期間 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">期間:</span>
        {presets.map((pr) => {
          const active = pr.from === from && pr.to === to;
          return (
            <Link
              key={pr.l}
              href={presetHref(pr.from, pr.to)}
              className={`rounded-full px-3 py-1 text-sm font-bold ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {pr.l}
            </Link>
          );
        })}
      </div>

      {/* 検索フォーム */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-500">
          ドライバー
          <select name="driver" defaultValue={driver} className="mt-0.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">
            <option value="">全ドライバー</option>
            {(drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.code}）
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          種別
          <select name="type" defaultValue={type} className="mt-0.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          開始日
          <input type="date" name="from" defaultValue={from} className="mt-0.5 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          終了日
          <input type="date" name="to" defaultValue={to} className="mt-0.5 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white">検索</button>
      </form>

      <p className="mb-3 text-sm text-slate-500">
        {selectedName ?? "全ドライバー"} / {typeLabel} / {from} 〜 {to}　写真 {total} 枚（{days.length} 日）
      </p>

      <PhotoGallery days={days} />
    </main>
  );
}
