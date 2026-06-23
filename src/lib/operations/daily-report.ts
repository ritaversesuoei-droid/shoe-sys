import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/errors";
import { diffMinutes } from "@/lib/time";
import { recomputeShift, minToInterval } from "@/lib/operations/shift";
import type { SaveDailyReportInput } from "@/lib/validation";

type SB = SupabaseClient<Database>;
type ShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

// ------------------------------------------------------------
// ドラフト型（未保存の自動生成結果 / 既存日報の整形結果）
// ------------------------------------------------------------
export interface DraftLeg {
  seq: number;
  shipper: string | null;
  origin_spot: string | null;
  destination_spot: string | null;
  cargo: string | null;
  receipts: string | null;
  extra_work: string | null;
  meter: number | null;
}
export interface DraftRest {
  seq: number;
  rest_type: "rest" | "sleep";
  place: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_min: number | null;
}
export interface DailyReportDraft {
  id: string | null;
  shift_id: string | null;
  report_date: string;
  status: "draft" | "confirmed";
  vehicle_no: string | null;
  crew: string | null;
  departure_at: string | null;
  return_at: string | null;
  meter_start: number | null;
  meter_end: number | null;
  notes: string | null;
  legs: DraftLeg[];
  rests: DraftRest[];
  generated: boolean; // true=eventからの自動生成（未保存） / false=既存日報
}

// ------------------------------------------------------------
// 運行（trip）の連結: 長距離休憩を跨ぐ複数勤務を1運行として束ねる（仕様書 4.6 手順1）
// ------------------------------------------------------------
async function closingEventType(sb: SB, shiftId: string): Promise<string | null> {
  const { data } = await sb
    .from("events")
    .select("event_type")
    .eq("shift_id", shiftId)
    .in("event_type", ["clock_out", "long_rest"])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.event_type ?? null;
}

interface TripEvent {
  event_type: string;
  occurred_at: string;
  vehicle_no: string | null;
  address: string | null;
  event_items: Database["public"]["Tables"]["event_items"]["Row"][] | null;
}

async function assembleTrip(
  sb: SB,
  driverId: string,
  reportDate: string,
): Promise<{ shifts: ShiftRow[]; events: TripEvent[] }> {
  const { data: dayShifts } = await sb
    .from("shifts")
    .select("*")
    .eq("driver_id", driverId)
    .eq("work_date", reportDate)
    .order("clock_in_at", { ascending: true });

  if (!dayShifts?.length) return { shifts: [], events: [] };

  const trip: ShiftRow[] = [dayShifts[0]!];
  let current = dayShifts[0]!;
  // 長距離休憩で閉じている限り、次の勤務へ連結
  while (current.clock_out_at) {
    const closing = await closingEventType(sb, current.id);
    if (closing !== "long_rest") break;
    const { data: next } = await sb
      .from("shifts")
      .select("*")
      .eq("driver_id", driverId)
      .gte("clock_in_at", current.clock_out_at)
      .neq("id", current.id)
      .order("clock_in_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) break;
    trip.push(next);
    current = next;
  }

  const ids = trip.map((s) => s.id);
  const { data: events } = await sb
    .from("events")
    .select("event_type, occurred_at, vehicle_no, address, event_items(*)")
    .in("shift_id", ids)
    .order("occurred_at", { ascending: true });

  return { shifts: trip, events: (events ?? []) as TripEvent[] };
}

/** 車番の直近終了メーター（自身より前の日報から）→ 開始メーター補完（仕様書 4.6 手順6 / F-21）。 */
async function lastMeter(
  sb: SB,
  vehicleNo: string | null,
  beforeDate: string,
): Promise<number | null> {
  if (!vehicleNo) return null;
  const { data } = await sb
    .from("daily_reports")
    .select("meter_end")
    .eq("vehicle_no", vehicleNo)
    .not("meter_end", "is", null)
    .lt("report_date", beforeDate)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.meter_end ?? null;
}

// ------------------------------------------------------------
// 日報の読込（既存があれば復元、無ければ event から自動生成）仕様書 F-10 / 4.6
// ------------------------------------------------------------
export async function assembleDailyReport(
  sb: SB,
  driverId: string,
  reportDate: string,
): Promise<DailyReportDraft | null> {
  // 既存日報（下書き/確定）があれば整形して返す（手順2）
  const { data: existing } = await sb
    .from("daily_reports")
    .select("*, daily_report_legs(*), daily_report_rests(*)")
    .eq("driver_id", driverId)
    .eq("report_date", reportDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const legs = (existing.daily_report_legs ?? [])
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map(
        (l): DraftLeg => ({
          seq: l.seq,
          shipper: l.shipper,
          origin_spot: l.origin_spot,
          destination_spot: l.destination_spot,
          cargo: l.cargo,
          receipts: l.receipts,
          extra_work: l.extra_work,
          meter: l.meter,
        }),
      );
    const rests = (existing.daily_report_rests ?? [])
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map(
        (r): DraftRest => ({
          seq: r.seq,
          rest_type: r.rest_type as "rest" | "sleep",
          place: r.place,
          start_at: r.start_at,
          end_at: r.end_at,
          duration_min: r.duration_min,
        }),
      );
    return {
      id: existing.id,
      shift_id: existing.shift_id,
      report_date: existing.report_date,
      status: existing.status as "draft" | "confirmed",
      vehicle_no: existing.vehicle_no,
      crew: existing.crew,
      departure_at: existing.departure_at,
      return_at: existing.return_at,
      meter_start: existing.meter_start,
      meter_end: existing.meter_end,
      notes: existing.notes,
      legs,
      rests,
      generated: false,
    };
  }

  // 自動生成（手順3〜6）
  const { shifts, events } = await assembleTrip(sb, driverId, reportDate);
  if (!shifts.length) return null;

  const start = shifts[0]!;
  const end = shifts[shifts.length - 1]!;
  const vehicleNo = events.find((e) => e.vehicle_no)?.vehicle_no ?? null;

  // 明細: 積込/荷卸 を時系列で展開（荷卸→過去積込の引き当ては TODO: 表記揺れ吸収）
  const legs: DraftLeg[] = [];
  let seq = 1;
  for (const e of events) {
    if (e.event_type === "loading") {
      const items = e.event_items ?? [];
      if (items.length) {
        for (const it of items) {
          legs.push({
            seq: seq++,
            shipper: it.shipper,
            origin_spot: e.address,
            destination_spot: it.delivery_spot,
            cargo: [it.quantity, it.weight].filter(Boolean).join(" ") || null,
            receipts: it.receipts,
            extra_work: null,
            meter: null,
          });
        }
      } else {
        legs.push({
          seq: seq++,
          shipper: null,
          origin_spot: e.address,
          destination_spot: null,
          cargo: null,
          receipts: null,
          extra_work: null,
          meter: null,
        });
      }
    } else if (e.event_type === "unloading") {
      const items = e.event_items ?? [];
      legs.push({
        seq: seq++,
        shipper: null,
        origin_spot: null,
        destination_spot: e.address,
        cargo: items.map((it) => it.cargo_type).filter(Boolean).join(", ") || null,
        receipts: items.map((it) => it.receipts).filter(Boolean).join(", ") || null,
        extra_work: null,
        meter: null,
      });
    }
  }

  // 休憩: 長距離休憩→次の各駅出発 を睡眠カードとして展開（手順5の一部）
  const rests: DraftRest[] = [];
  let rseq = 1;
  const longRests = events.filter((e) => e.event_type === "long_rest");
  const legDeps = events.filter((e) => e.event_type === "leg_departure");
  for (const lr of longRests) {
    const next = legDeps.find((d) => d.occurred_at > lr.occurred_at);
    const endAt = next?.occurred_at ?? null;
    rests.push({
      seq: rseq++,
      rest_type: "sleep",
      place: lr.address,
      start_at: lr.occurred_at,
      end_at: endAt,
      duration_min: endAt ? diffMinutes(lr.occurred_at, endAt) : null,
    });
  }

  return {
    id: null,
    shift_id: start.id,
    report_date: reportDate,
    status: "draft",
    vehicle_no: vehicleNo,
    crew: null,
    departure_at: start.clock_in_at,
    return_at: end.clock_out_at,
    meter_start: await lastMeter(sb, vehicleNo, reportDate),
    meter_end: null,
    notes: null,
    legs,
    rests,
    generated: true,
  };
}

// ------------------------------------------------------------
// 保存・確定（仕様書 4.6）
//   業務ルール: status=draft は一時書き（緩い）。status=confirmed は確定（バリデーション必須）。
//   長距離休憩では確定しない（呼び出し側の打刻種別で制御）。
// ------------------------------------------------------------
type RestInput = { duration_min?: number; start_at?: string; end_at?: string };

function restDuration(r: RestInput): number {
  if (r.duration_min != null) return r.duration_min;
  if (r.start_at && r.end_at) {
    return Math.max(0, diffMinutes(r.start_at, r.end_at) ?? 0);
  }
  return 0;
}

/** 確定バリデーション（仕様書 4.6 保存時バリデーション）。エラーメッセージ配列を返す。 */
export function validateForConfirm(input: SaveDailyReportInput): string[] {
  const errs: string[] = [];
  if (!input.vehicle_no) errs.push("車番は必須です");
  if (input.meter_end == null) errs.push("終了メーターは必須です");
  if (
    input.meter_start != null &&
    input.meter_end != null &&
    input.meter_end < input.meter_start
  ) {
    errs.push("終了メーターが開始メーターを下回っています");
  }
  const rests = input.rests ?? [];
  const total = rests.reduce((s, r) => s + restDuration(r), 0);
  if (total < 90) errs.push("休憩は合計90分以上必要です");
  for (const r of rests) {
    if (!r.place) errs.push("休憩場所が未入力のカードがあります");
    if (!r.start_at || !r.end_at) errs.push("休憩の開始/終了が空のカードがあります");
    else if (Date.parse(r.end_at) <= Date.parse(r.start_at))
      errs.push("休憩の終了が開始以前のカードがあります");
  }
  // TODO(運行ルート確認 4.6): 全legの○確認チェック（daily_report_legs.confirmed 列を将来追加）
  return Array.from(new Set(errs));
}

/** 日報の保存（ヘッダ upsert + 明細/休憩を全置換）。 */
export async function saveDailyReport(
  sb: SB,
  driverId: string,
  input: SaveDailyReportInput,
): Promise<DailyReportDraft> {
  const status = input.status ?? "draft";
  if (status === "confirmed") {
    const errs = validateForConfirm(input);
    if (errs.length) throw new AppError("確定できません: " + errs.join(" / "), 422);
  }

  const rests = input.rests ?? [];
  const restTotal = rests.reduce((s, r) => s + restDuration(r), 0);

  // 1運行1日報: id 明示が無ければ driver+date で既存を特定（4.6）
  let reportId = input.id ?? null;
  let existingShiftId: string | null = null;
  if (!reportId) {
    const { data: ex } = await sb
      .from("daily_reports")
      .select("id, shift_id")
      .eq("driver_id", driverId)
      .eq("report_date", input.report_date)
      .limit(1)
      .maybeSingle();
    reportId = ex?.id ?? null;
    existingShiftId = ex?.shift_id ?? null;
  }

  // 紐付く勤務: 明示 → 既存日報 → 当日の勤務 の順で特定（確定時の休憩反映/PDFに使用）
  let shiftId = input.shift_id ?? existingShiftId ?? null;
  if (!shiftId) {
    const { data: sh } = await sb
      .from("shifts")
      .select("id")
      .eq("driver_id", driverId)
      .eq("work_date", input.report_date)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    shiftId = sh?.id ?? null;
  }

  const header = {
    driver_id: driverId,
    shift_id: shiftId,
    report_date: input.report_date,
    status,
    vehicle_no: input.vehicle_no ?? null,
    crew: input.crew ?? null,
    meter_start: input.meter_start ?? null,
    meter_end: input.meter_end ?? null,
    rest_total_min: restTotal,
    notes: input.notes ?? null,
    confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
  };

  if (reportId) {
    const { error } = await sb.from("daily_reports").update(header).eq("id", reportId);
    if (error) throw error;
  } else {
    const { data, error } = await sb
      .from("daily_reports")
      .insert(header)
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("日報の作成に失敗しました");
    reportId = data.id;
  }

  // 明細・休憩を全置換
  await sb.from("daily_report_legs").delete().eq("daily_report_id", reportId);
  await sb.from("daily_report_rests").delete().eq("daily_report_id", reportId);

  const legs = input.legs ?? [];
  if (legs.length) {
    const rows = legs.map((l, i) => ({
      daily_report_id: reportId!,
      seq: l.seq ?? i + 1,
      shipper: l.shipper ?? null,
      origin_spot: l.origin_spot ?? null,
      destination_spot: l.destination_spot ?? null,
      cargo: l.cargo ?? null,
      receipts: l.receipts ?? null,
      extra_work: l.extra_work ?? null,
      meter: l.meter ?? null,
    }));
    const { error } = await sb.from("daily_report_legs").insert(rows);
    if (error) throw error;
  }
  if (rests.length) {
    const rows = rests.map((r, i) => ({
      daily_report_id: reportId!,
      seq: r.seq ?? i + 1,
      rest_type: r.rest_type ?? "rest",
      place: r.place ?? null,
      start_at: r.start_at ?? null,
      end_at: r.end_at ?? null,
      duration_min: restDuration(r),
    }));
    const { error } = await sb.from("daily_report_rests").insert(rows);
    if (error) throw error;
  }

  // 確定時: 紐付く勤務へ休憩(rest_total_min)を反映 → 拘束/労働/違反を再計算 → PDFをサーバー生成（F-17/18）
  if (status === "confirmed") {
    if (shiftId) {
      await sb.from("shifts").update({ rest_time: minToInterval(restTotal) }).eq("id", shiftId);
      await recomputeShift(sb, shiftId);
    }
    // PDFはベストエフォート（Chrome未導入環境でも確定自体は失敗させない）
    try {
      const { generateDailyReportPdf } = await import("@/lib/pdf/generate");
      const pdf = await generateDailyReportPdf(sb, driverId, input.report_date);
      if (pdf) {
        await sb
          .from("daily_reports")
          .update({ pdf_path: pdf.path, pdf_generated_at: new Date().toISOString() })
          .eq("id", reportId);
      }
    } catch (e) {
      console.warn("[daily-report] PDFサーバー生成をスキップ:", e instanceof Error ? e.message : e);
    }
  }

  const saved = await assembleDailyReport(sb, driverId, input.report_date);
  if (!saved) throw new Error("保存後の読込に失敗しました");
  return saved;
}
