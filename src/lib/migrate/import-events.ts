import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import { cleanText, cleanCode } from "./cleanse";
import { toJstIso } from "./xlsx";
import { createDriverResolver } from "./roster";

type SB = SupabaseClient<Database>;
type Row = Record<string, string>;
type EventType = Database["public"]["Tables"]["events"]["Row"]["event_type"];

// 現行 event_type（日本語）→ enum
const TYPE_MAP: Record<string, EventType> = {
  出勤: "departure",
  出発: "departure",
  出庫: "departure",
  各駅出発: "leg_departure",
  長距離各駅出発: "leg_departure",
  到着報告: "arrival",
  到着: "arrival",
  積込完了: "loading",
  積込: "loading",
  物込: "loading",
  荷卸完了: "unloading",
  荷卸: "unloading",
  長距離休息: "long_rest",
  長距離休憩: "long_rest",
  退勤: "clock_out",
  帰庫: "clock_out",
  通常退勤: "clock_out",
};

/** event_log → events (+ event_items)。idempotency_key=event_id で冪等。shift_id は時刻で best-effort 連結。 */
export async function importEventLog(
  sb: SB,
  rows: Row[],
  resolver: ReturnType<typeof createDriverResolver>,
): Promise<{ events: number; items: number; skipped: number }> {
  // 客先名→id を事前ロード
  const custByName = new Map<string, string>();
  const { data: custs } = await sb.from("customers").select("id, name");
  for (const c of custs ?? []) custByName.set(cleanText(c.name), c.id);

  let events = 0;
  let items = 0;
  let skipped = 0;

  for (const r of rows) {
    const et = TYPE_MAP[(r["event_type"] || "").trim()];
    const occurredAt = toJstIso(r["server_ts"]);
    const eventId = (r["event_id"] || "").trim();
    const name = cleanText(r["driver_name"]);
    if (!et || !occurredAt || !eventId || !name) {
      skipped += 1;
      continue;
    }

    // 冪等: 同一 event_id（idempotency_key）は再投入しない
    const { data: dup } = await sb.from("events").select("id").eq("idempotency_key", eventId).limit(1).maybeSingle();
    if (dup) {
      skipped += 1;
      continue;
    }

    const driverId = (await resolver.resolve(name, { affiliation: "昭栄運輸", create: true }))!;

    // shift_id を時刻で連結（出勤時刻 <= occurred、退勤未設定 or 退勤 >= occurred）
    let shiftId: string | null = null;
    const { data: cand } = await sb
      .from("shifts")
      .select("id, clock_out_at")
      .eq("driver_id", driverId)
      .lte("clock_in_at", occurredAt)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cand && (cand.clock_out_at == null || cand.clock_out_at >= occurredAt)) shiftId = cand.id;

    const customerId = custByName.get(cleanText(r["customerName"])) ?? null;

    const { data: ins, error } = await sb
      .from("events")
      .insert({
        driver_id: driverId,
        shift_id: shiftId,
        event_type: et,
        occurred_at: occurredAt,
        vehicle_no: r["track_no"] ? cleanCode(r["track_no"]) : null,
        address: r["location_name"] ? cleanText(r["location_name"]) : null,
        customer_id: customerId,
        checks: r["チェック項目"] ? cleanText(r["チェック項目"]) : null,
        note: r["note"] ? cleanText(r["note"]) : null,
        idempotency_key: eventId,
      })
      .select("id")
      .single();
    if (error || !ins) throw error ?? new Error("event挿入失敗");
    events += 1;

    // 積込/荷卸は明細1件
    if (et === "loading" || et === "unloading") {
      const it: TablesInsert<"event_items"> = {
        event_id: ins.id,
        seq: 1,
        // customerName は積込のみ荷主。荷卸では動作ラベル(「荷卸し完了」等)のため採用しない。
        shipper: et === "loading" ? cleanText(r["customerName"]) || null : null,
        delivery_spot: cleanText(r["delivery_spot"]) || null,
        quantity: cleanText(r["数量"]) || null,
        weight: cleanText(r["重量"]) || null,
        slip_no: cleanText(r["伝票枚数"]) || null,
        receipts: cleanText(r["受領枚数"]) || null,
      };
      if (it.shipper || it.delivery_spot || it.quantity || it.weight || it.slip_no || it.receipts) {
        const { error: iErr } = await sb.from("event_items").insert(it);
        if (iErr) throw iErr;
        items += 1;
      }
    }
  }
  return { events, items, skipped };
}
