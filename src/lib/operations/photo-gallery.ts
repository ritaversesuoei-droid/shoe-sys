import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

export interface PhotoEntry {
  eventId: string;
  time: string; // HH:MM (JST)
  type: string; // event_type
  driverId: string;
  driverName: string;
  driverCode: string | null;
  urls: string[]; // 署名付きURL（有効期限付き）
}
export interface PhotoDay {
  day: string; // yyyy-MM-dd (JST)
  entries: PhotoEntry[];
  count: number; // その日の写真枚数
}

function jstParts(iso: string): { day: string; hhmm: string } {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    hhmm: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

/**
 * 打刻写真ギャラリー（F-22/管理）。ドライバー別・月別に、日ごとの写真を集約して返す。
 *   保存パス規約 {yyyymm}/{driver_id}/... のとおり実質「ドライバーのフォルダ」を横断表示する。
 *   非公開バケットのため createSignedUrls で一括署名（1時間）。service_role で実行すること。
 */
export async function getPhotoGallery(sb: SB, monthKey: string, driverId?: string): Promise<PhotoDay[]> {
  const y = monthKey.slice(0, 4);
  const m = monthKey.slice(4, 6);
  const start = `${y}-${m}-01T00:00:00+09:00`;
  const mo = Number(m);
  const nextMo = mo === 12 ? `${Number(y) + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const end = `${nextMo}-01T00:00:00+09:00`;

  let q = sb
    .from("events")
    .select("id, driver_id, occurred_at, event_type, drivers(name, code), event_photos!inner(storage_path, seq)")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: false });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];

  // 全パスを一括で署名URL化
  const allPaths = [
    ...new Set(rows.flatMap((r) => (r.event_photos as { storage_path: string }[]).map((p) => p.storage_path))),
  ];
  const urlByPath = new Map<string, string>();
  if (allPaths.length) {
    const { data: signed } = await sb.storage.from("event-photos").createSignedUrls(allPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  const dayMap = new Map<string, PhotoDay>();
  for (const r of rows) {
    const drv = r.drivers as { name: string; code: string } | null;
    const photos = (r.event_photos as { storage_path: string; seq: number | null }[])
      .slice()
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const urls = photos.map((p) => urlByPath.get(p.storage_path)).filter((u): u is string => !!u);
    if (!urls.length) continue;
    const { day, hhmm } = jstParts(r.occurred_at);
    let d = dayMap.get(day);
    if (!d) {
      d = { day, entries: [], count: 0 };
      dayMap.set(day, d);
    }
    d.entries.push({
      eventId: r.id,
      time: hhmm,
      type: r.event_type,
      driverId: r.driver_id,
      driverName: drv?.name ?? "(不明)",
      driverCode: drv?.code ?? null,
      urls,
    });
    d.count += urls.length;
  }

  return [...dayMap.values()].sort((a, b) => b.day.localeCompare(a.day));
}
