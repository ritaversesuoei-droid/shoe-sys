import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PunchError } from "@/lib/errors";
import { findOpenShift, openShift, closeShift, type CloseResult } from "./shift";

type SB = SupabaseClient<Database>;
type EventType = Database["public"]["Tables"]["events"]["Row"]["event_type"];

export interface PunchItem {
  seq?: number;
  shipper?: string;
  delivery_spot?: string;
  quantity?: string;
  weight?: string;
  slip_no?: string;
  receipts?: string;
  cargo_type?: string;
  note?: string;
}

export interface PunchInput {
  idempotency_key: string;
  event_type: EventType;
  occurred_at: string;
  vehicle_no?: string;
  lat?: number;
  lng?: number;
  address?: string;
  customer_id?: string | null;
  checks?: string;
  alcohol_checked?: boolean;
  note?: string;
  items?: PunchItem[];
  photo_paths?: string[];
}

export interface PunchResult {
  eventId: string;
  shiftId: string | null;
  deduped?: boolean;
  close?: CloseResult;
}

const OPENS_SHIFT: EventType[] = ["departure", "leg_departure"];
const CLOSES_SHIFT: EventType[] = ["clock_out", "long_rest"];
const ALCOHOL_REQUIRED: EventType[] = ["leg_departure", "long_rest"];

/**
 * 打刻オーケストレーション（仕様書 4.3）。
 *   冪等チェック → 二重打刻防止(4.3.3) → 勤務連結 → events挿入(+items/photos)
 *   → 退勤/休憩なら勤務クローズ+集計+違反判定。
 * driverId は呼び出し側で確定（route=セッション, バッチ=明示）。
 */
export async function processPunch(
  sb: SB,
  driverId: string,
  input: PunchInput,
): Promise<PunchResult> {
  // (冪等) 同一キーが既にあれば再実行しない
  const { data: existing, error: exErr } = await sb
    .from("events")
    .select("id, shift_id")
    .eq("idempotency_key", input.idempotency_key)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) return { eventId: existing.id, shiftId: existing.shift_id, deduped: true };

  // アルコールチェック必須（長距離各駅出発・長距離休憩 / 4.3.2）
  if (ALCOHOL_REQUIRED.includes(input.event_type) && input.alcohol_checked !== true) {
    throw new PunchError("アルコールチェックの実施が必要です");
  }

  const open = await findOpenShift(sb, driverId);

  // 二重打刻防止（4.3.3）
  if (OPENS_SHIFT.includes(input.event_type) && open) {
    throw new PunchError("前回の退勤が記録されていません（出発の重複）");
  }
  if (CLOSES_SHIFT.includes(input.event_type) && !open) {
    throw new PunchError("出発データが見つからないか、既に退勤済みです");
  }

  // 勤務連結: 出発系は新規作成、それ以外は現在の開勤務へ紐付け
  let shiftId: string | null;
  let openedShift = null;
  if (OPENS_SHIFT.includes(input.event_type)) {
    openedShift = await openShift(sb, driverId, input.occurred_at);
    shiftId = openedShift.id;
  } else {
    shiftId = open?.id ?? null;
  }

  // events 挿入
  const { data: inserted, error: insErr } = await sb
    .from("events")
    .insert({
      driver_id: driverId,
      shift_id: shiftId,
      event_type: input.event_type,
      occurred_at: input.occurred_at,
      vehicle_no: input.vehicle_no ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      address: input.address ?? null,
      customer_id: input.customer_id ?? null,
      checks: input.checks ?? null,
      alcohol_checked: input.alcohol_checked ?? null,
      note: input.note ?? null,
      idempotency_key: input.idempotency_key,
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("打刻の保存に失敗しました");

  // 明細・写真
  if (input.items?.length) {
    const rows = input.items.map((it, i) => ({
      event_id: inserted.id,
      seq: it.seq ?? i + 1,
      shipper: it.shipper ?? null,
      delivery_spot: it.delivery_spot ?? null,
      quantity: it.quantity ?? null,
      weight: it.weight ?? null,
      slip_no: it.slip_no ?? null,
      receipts: it.receipts ?? null,
      cargo_type: it.cargo_type ?? null,
      note: it.note ?? null,
    }));
    const { error } = await sb.from("event_items").insert(rows);
    if (error) throw error;
  }
  if (input.photo_paths?.length) {
    const rows = input.photo_paths.map((p, i) => ({
      event_id: inserted.id,
      storage_path: p,
      seq: i + 1,
    }));
    const { error } = await sb.from("event_photos").insert(rows);
    if (error) throw error;
  }

  // 退勤 / 長距離休憩: 勤務クローズ＋集計＋違反判定
  let close: CloseResult | undefined;
  if (CLOSES_SHIFT.includes(input.event_type) && open) {
    close = await closeShift(sb, open, input.occurred_at);
  }

  // TODO: 逆ジオコーディング・客先名推定(F-22) / LINE通知(F-16)
  return { eventId: inserted.id, shiftId, close };
}
