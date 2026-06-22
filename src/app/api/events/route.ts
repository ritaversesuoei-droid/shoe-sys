import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { createEventSchema } from "@/lib/validation";
import { processPunch } from "@/lib/operations/punch";

/**
 * POST /api/events  打刻受付（全種別共通 / 仕様書 4.3, 8.2）
 *
 * パイプライン（src/lib/operations/punch.ts processPunch）:
 *   1. 冪等チェック（idempotency_key / 4.3.4）
 *   2. アルコールチェック必須（長距離各駅出発・長距離休憩 / 4.3.2）
 *   3. 二重打刻防止（4.3.3）
 *   4. 勤務連結（出発系=新規作成 / 退勤・休憩=クローズ）
 *   5. events 挿入（+ event_items / event_photos）
 *   6. 退勤・休憩なら 勤怠集計＋改善基準告示判定＋compliance_alerts
 *   TODO: 逆ジオコーディング・客先名推定(F-22) / LINE通知(F-16) / 写真Storage前段
 */
export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = createEventSchema.parse(await request.json());
    const supabase = await createClient();

    const result = await processPunch(supabase, ctx.driverId, body);

    if (result.deduped) {
      return ok({ eventId: result.eventId, shiftId: result.shiftId, deduped: true });
    }
    return ok(
      {
        eventId: result.eventId,
        shiftId: result.shiftId,
        ...(result.close
          ? { metrics: result.close.metrics, judgement: result.close.judgement }
          : {}),
      },
      201,
    );
  });
}
