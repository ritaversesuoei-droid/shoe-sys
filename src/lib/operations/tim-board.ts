import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;
type EventType = Database["public"]["Tables"]["events"]["Row"]["event_type"];

export type TimStatus = "working" | "finished" | "idle";

export interface TimItem {
  shipper: string | null;
  delivery_spot: string | null;
  quantity: string | null;
  weight: string | null;
  cargo_type: string | null;
  receipts: string | null;
  slip_no: string | null;
}
export interface TimEvent {
  id: string;
  time: string; // HH:MM (JST)
  type: EventType;
  address: string | null;
  customer: string | null;
  checks: string | null; // 点検項目（荷卸: 荷物異常なし/受領印日付OK/…）
  note: string | null;
  lat: number | null;
  lng: number | null;
  items: TimItem[];
  photos: string[]; // 署名付きURL（非公開バケット event-photos・有効期限付き）
}
export interface TimRow {
  driverId: string;
  name: string;
  code: string | null;
  status: TimStatus;
  lastAt: string | null;
  lineUserId: string | null;
  events: TimEvent[];
}

function jstHHMM(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const OPENS: ReadonlySet<EventType> = new Set(["departure"]);
const CLOSES: ReadonlySet<EventType> = new Set(["clock_out", "long_rest"]);

/**
 * T・I・M 運行管理パネル（現行GAS「T・I・M」の再現）。
 *   指定日(JST)の全ドライバー打刻をドライバー単位のタイムラインに集約し、最新活動順で返す。
 *   status: working=出勤済で未退勤 / finished=退勤・長距離休憩済 / idle=打刻のみ。
 */
export async function getTimBoard(sb: SB, dateStr: string): Promise<TimRow[]> {
  const start = `${dateStr}T00:00:00+09:00`;
  const end = `${addDaysStr(dateStr, 1)}T00:00:00+09:00`;

  const { data: events, error } = await sb
    .from("events")
    .select(
      "id, driver_id, event_type, occurred_at, address, note, checks, lat, lng, drivers(code, name, line_user_id), customers(name), event_items(shipper, delivery_spot, quantity, weight, cargo_type, receipts, slip_no), event_photos(storage_path, seq)",
    )
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: true });
  if (error) throw error;

  const map = new Map<string, TimRow>();
  const pathsByEvent = new Map<string, string[]>(); // event.id → storage_path[]（後で署名URL化）
  for (const e of events ?? []) {
    const drv = e.drivers as { code: string; name: string; line_user_id: string | null } | null;
    const cust = e.customers as { name: string } | null;
    let row = map.get(e.driver_id);
    if (!row) {
      row = {
        driverId: e.driver_id,
        name: drv?.name ?? "(不明)",
        code: drv?.code ?? null,
        status: "idle",
        lastAt: null,
        lineUserId: drv?.line_user_id ?? null,
        events: [],
      };
      map.set(e.driver_id, row);
    }
    const photos = (e.event_photos ?? []) as { storage_path: string; seq: number | null }[];
    pathsByEvent.set(
      e.id,
      photos.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).map((p) => p.storage_path),
    );
    row.events.push({
      id: e.id,
      time: jstHHMM(e.occurred_at),
      type: e.event_type,
      address: e.address,
      customer: cust?.name ?? null,
      checks: e.checks,
      note: e.note,
      lat: e.lat,
      lng: e.lng,
      items: (e.event_items ?? []) as TimItem[],
      photos: [],
    });
    row.lastAt = e.occurred_at;
  }

  // 写真: 非公開バケットの storage_path を一括で署名付きURLに変換（有効期限1時間）
  const allPaths = [...new Set([...pathsByEvent.values()].flat())];
  if (allPaths.length) {
    const { data: signed } = await sb.storage.from("event-photos").createSignedUrls(allPaths, 3600);
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    for (const row of map.values()) {
      for (const ev of row.events) {
        ev.photos = (pathsByEvent.get(ev.id) ?? []).map((p) => urlByPath.get(p)).filter((u): u is string => !!u);
      }
    }
  }

  for (const row of map.values()) {
    const hasStart = row.events.some((x) => OPENS.has(x.type));
    const hasEnd = row.events.some((x) => CLOSES.has(x.type));
    row.status = hasStart && !hasEnd ? "working" : hasEnd ? "finished" : "idle";
  }

  // 最新の打刻が新しい順（現行GAS renderBoard の並びに準拠）
  return [...map.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}
