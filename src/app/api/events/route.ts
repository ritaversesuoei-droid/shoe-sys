import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { createEventSchema } from "@/lib/validation";

/**
 * POST /api/events  打刻受付（全種別共通 / 仕様書 4.3, 8.2）
 *
 * 完全パイプライン（順次実装）:
 *   1. 二重打刻チェック（4.3.3: 出発/各駅出発=直近勤務が退勤済 / 退勤・休憩=未退勤）  … TODO
 *   2. 写真 Storage 保存（クライアントで圧縮済みのパスを受領）
 *   3. 逆ジオコーディング → 客先名推定（F-22）                                      … TODO
 *   4. 優先キー判定（idempotency_key: 既存なら上書き / 4.3.4）
 *   5. events 挿入（+ event_items / event_photos）
 *   6. shift 連結（出発/各駅出発=新規作成, 退勤/長距離休憩=clock_out 記入）            … 一部TODO
 *   7. 必要に応じ shift 集計・改善基準告示判定・LINE通知                              … TODO
 */
export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = createEventSchema.parse(await request.json());
    const supabase = await createClient();

    // (4) 冪等性: 同一 idempotency_key が既にあれば、その eventId を返す（再送安全）
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();
    if (existing) return ok({ eventId: existing.id, deduped: true });

    // TODO(1): 二重打刻防止ルール（直近 shift 状態の検査）
    // TODO(3): 逆ジオコーディング・客先名推定（F-22）

    // (5) events 挿入
    const { data: inserted, error } = await supabase
      .from("events")
      .insert({
        driver_id: ctx.driverId,
        event_type: body.event_type,
        occurred_at: body.occurred_at,
        vehicle_no: body.vehicle_no ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        address: body.address ?? null,
        checks: body.checks ?? null,
        alcohol_checked: body.alcohol_checked ?? null,
        note: body.note ?? null,
        idempotency_key: body.idempotency_key,
      })
      .select("id")
      .single();
    if (error || !inserted) return fail(error?.message ?? "保存に失敗しました", 500);

    // event_items（積込/荷卸 明細）
    if (body.items?.length) {
      const rows = body.items.map((it, i) => ({
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
      const { error: itemErr } = await supabase.from("event_items").insert(rows);
      if (itemErr) return fail(itemErr.message, 500);
    }

    // event_photos（Storage パス）
    if (body.photo_paths?.length) {
      const rows = body.photo_paths.map((p, i) => ({
        event_id: inserted.id,
        storage_path: p,
        seq: i + 1,
      }));
      const { error: photoErr } = await supabase.from("event_photos").insert(rows);
      if (photoErr) return fail(photoErr.message, 500);
    }

    // TODO(6,7): shift 連結 / 集計 / 改善基準告示判定 / LINE通知（F-16）
    return ok({ eventId: inserted.id }, 201);
  });
}
