import { z } from "zod";

/**
 * 入力バリデーション（仕様書 8.2: type は許可リスト等）。
 */

export const eventTypeSchema = z.enum([
  "departure",
  "leg_departure",
  "arrival",
  "loading",
  "unloading",
  "long_rest",
  "clock_out",
  "rest_start",
  "rest_end",
]);

export const eventItemSchema = z.object({
  seq: z.number().int().min(1).max(3).optional(),
  shipper: z.string().optional(),
  delivery_spot: z.string().optional(),
  quantity: z.string().optional(),
  weight: z.string().optional(),
  slip_no: z.string().optional(),
  receipts: z.string().optional(),
  cargo_type: z.string().optional(),
  note: z.string().optional(),
});

/** POST /api/events 入力（仕様書 4.3 / 8.2） */
export const createEventSchema = z.object({
  idempotency_key: z.string().uuid("冪等キーはUUID"),
  event_type: eventTypeSchema,
  occurred_at: z.string().datetime({ offset: true }),
  vehicle_no: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  checks: z.string().optional(),
  alcohol_checked: z.boolean().optional(),
  note: z.string().optional(),
  items: z.array(eventItemSchema).max(3).optional(),
  // 写真は別途 Storage アップロード後にパスを渡す想定
  photo_paths: z.array(z.string()).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** POST /api/daily-reports 入力（仕様書 4.6） */
export const saveDailyReportSchema = z.object({
  id: z.string().uuid().optional(),
  shift_id: z.string().uuid().optional(),
  report_date: z.string(), // yyyy-MM-dd
  status: z.enum(["draft", "confirmed"]).default("draft"),
  vehicle_no: z.string().optional(),
  crew: z.string().optional(),
  meter_start: z.number().optional(),
  meter_end: z.number().optional(),
  notes: z.string().optional(),
  legs: z
    .array(
      z.object({
        seq: z.number().int().min(1).optional(),
        shipper: z.string().optional(),
        origin_spot: z.string().optional(),
        destination_spot: z.string().optional(),
        cargo: z.string().optional(),
        receipts: z.string().optional(),
        extra_work: z.string().optional(),
        meter: z.number().optional(),
        confirmed: z.boolean().optional(),
      }),
    )
    .optional(),
  rests: z
    .array(
      z.object({
        seq: z.number().int().min(1).optional(),
        rest_type: z.enum(["rest", "sleep"]).default("rest"),
        place: z.string().optional(),
        start_at: z.string().optional(),
        end_at: z.string().optional(),
        duration_min: z.number().int().optional(),
      }),
    )
    .optional(),
});
export type SaveDailyReportInput = z.infer<typeof saveDailyReportSchema>;

/** POST /api/admin/warnings/:id/correction 入力（仕様書 F-13） */
export const correctionSchema = z.object({
  correction_reason: z.string().min(1, "是正理由は必須"),
  correction_note: z.string().optional(),
  resolve: z.boolean().default(true),
});

/** POST /api/admin/monthly-summary 入力（仕様書 F-14） */
export const monthlySummarySchema = z.object({
  month_key: z.string().regex(/^\d{6}$/, "yyyyMM 形式"),
  driver_id: z.string().uuid().optional(),
});

/** POST /api/auth/line 入力（ドライバー LINE ログイン / F-01） */
export const lineLoginSchema = z.object({
  id_token: z.string().min(1),
});

/** マスタ管理（管理者）: ドライバー作成/更新 */
export const driverCreateSchema = z.object({
  code: z.string().min(1, "業務IDは必須"),
  name: z.string().min(1, "氏名は必須"),
  default_vehicle_no: z.string().optional(),
  affiliation: z.string().optional(),
  line_user_id: z.string().optional(),
});
export const driverUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  default_vehicle_no: z.string().nullable().optional(),
  affiliation: z.string().nullable().optional(),
  line_user_id: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

/** マスタ管理（管理者）: 車両作成/更新 */
export const vehicleCreateSchema = z.object({
  vehicle_no: z.string().min(1, "車番は必須"),
  name: z.string().optional(),
  kind: z.string().optional(),
});
export const vehicleUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});
