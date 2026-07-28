import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPhotoGallery } from "@/lib/operations/photo-gallery";
import { to_month_key } from "@/lib/datekey";
import { PhotoGallery } from "@/components/admin/PhotoGallery";

export const dynamic = "force-dynamic";

function normalizeMonth(v: string | undefined): string {
  if (!v) return to_month_key(new Date());
  const digits = v.replace(/-/g, "");
  return /^\d{6}$/.test(digits) ? digits : to_month_key(new Date());
}

/**
 * 打刻写真ギャラリー（管理）。ドライバー別・月別に、日ごとの写真を検索・閲覧する。
 * 保存パス {yyyymm}/{driver_id}/... により実質「ドライバーのフォルダ」を横断表示。
 */
export default async function PhotosPage({
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

  const supa = await createClient();
  const { data: drivers } = await supa.from("drivers").select("id, name, code").order("code", { ascending: true });

  // 署名URL発行のため service_role
  const admin = createAdminClient();
  const days = await getPhotoGallery(admin, monthKey, driver || undefined);
  const total = days.reduce((s, d) => s + d.count, 0);
  const selectedName = drivers?.find((d) => d.id === driver)?.name;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">写真（ドライバー別・月別）</h1>
        <Link href="/admin" className="text-sm text-blue-600">← ダッシュボード</Link>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <select name="driver" defaultValue={driver ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">全ドライバー</option>
          {(drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}（{d.code}）
            </option>
          ))}
        </select>
        <input type="month" name="month" defaultValue={monthInput} className="rounded-lg border border-slate-300 px-3 py-2" />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white">検索</button>
      </form>

      <p className="mb-3 text-sm text-slate-500">
        {selectedName ? `${selectedName} / ` : "全ドライバー / "}
        {monthInput}　写真 {total} 枚（{days.length} 日）
      </p>

      <PhotoGallery days={days} />
    </main>
  );
}
