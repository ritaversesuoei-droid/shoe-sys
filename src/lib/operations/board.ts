import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

export type BoardStatus = "active" | "rest" | "done" | "idle";

export interface BoardEntry {
  driverId: string;
  driverName: string;
  driverCode: string | null;
  vehicleNo: string | null;
  status: BoardStatus;
  lastEventType: string | null;
  lastEventLabel: string;
  lastAt: string | null;
  address: string | null;
  eventCount: number;
}

export const EVENT_LABEL: Record<string, string> = {
  departure: "出発",
  leg_departure: "各駅出発",
  arrival: "到着",
  loading: "積込",
  unloading: "荷卸",
  long_rest: "長距離休憩",
  clock_out: "退勤",
  rest_start: "休憩開始",
  rest_end: "休憩終了",
};

function statusOf(eventType: string | null): BoardStatus {
  if (eventType === "clock_out") return "done";
  if (eventType === "long_rest" || eventType === "rest_start") return "rest";
  if (eventType) return "active";
  return "idle";
}

/**
 * 運行盤面（仕様書 F-15）。指定日の全ドライバー打刻を集約し、ドライバー単位の最新状態を返す。
 * 稼働中(active)/休息(rest)/終業(done) を判定し、稼働→休息→終業→の順で並べる。
 */
export async function getTodayBoard(sb: SB, date: string): Promise<BoardEntry[]> {
  const { data, error } = await sb
    .from("events")
    .select("driver_id, event_type, occurred_at, vehicle_no, address, drivers(code, name)")
    .gte("occurred_at", `${date}T00:00:00+09:00`)
    .lte("occurred_at", `${date}T23:59:59+09:00`)
    .order("occurred_at", { ascending: true });
  if (error) throw error;

  const byDriver = new Map<string, BoardEntry>();
  for (const e of data ?? []) {
    const driver = e.drivers as { code: string; name: string } | null;
    const cur = byDriver.get(e.driver_id);
    if (!cur) {
      byDriver.set(e.driver_id, {
        driverId: e.driver_id,
        driverName: driver?.name ?? "(不明)",
        driverCode: driver?.code ?? null,
        vehicleNo: e.vehicle_no,
        status: statusOf(e.event_type),
        lastEventType: e.event_type,
        lastEventLabel: EVENT_LABEL[e.event_type] ?? e.event_type,
        lastAt: e.occurred_at,
        address: e.address,
        eventCount: 1,
      });
    } else {
      // 時系列昇順なので毎回上書きすれば最終状態になる
      cur.status = statusOf(e.event_type);
      cur.lastEventType = e.event_type;
      cur.lastEventLabel = EVENT_LABEL[e.event_type] ?? e.event_type;
      cur.lastAt = e.occurred_at;
      cur.vehicleNo = e.vehicle_no ?? cur.vehicleNo;
      cur.address = e.address ?? cur.address;
      cur.eventCount += 1;
    }
  }

  const order: Record<BoardStatus, number> = { active: 0, rest: 1, done: 2, idle: 3 };
  return Array.from(byDriver.values()).sort(
    (a, b) => order[a.status] - order[b.status] || (a.driverCode ?? "").localeCompare(b.driverCode ?? ""),
  );
}
