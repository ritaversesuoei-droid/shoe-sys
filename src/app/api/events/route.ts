import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { createEventSchema } from "@/lib/validation";
import { processPunch } from "@/lib/operations/punch";
import { isLineConfigured, notifyBusinessReport, notifyWarning } from "@/lib/line/notify";
import { toWorkDate } from "@/lib/datekey";

/**
 * POST /api/events  打刻受付（全種別共通 / 仕様書 4.3, 8.2）
 *
 * パイプライン（src/lib/operations/punch.ts processPunch）:
 *   1. 冪等チェック（idempotency_key / 4.3.4）
 *   2. アルコールチェック必須（長距離再出発・長距離休憩 / 4.3.2）
 *   3. 二重打刻防止（4.3.3）
 *   4. 勤務連結（出発系=新規作成 / 退勤・休憩=クローズ）
 *   5. events 挿入（+ event_items / event_photos）
 *   6. 退勤・休憩なら 勤怠集計＋改善基準告示判定＋compliance_alerts
 *   7. LINE通知（F-16: 積込/荷卸=業務報告, 違反検知=警告。失敗してもリクエストは成功）
 *   ※ 逆ジオ・客先名推定(F-22) は processPunch 内で実施（全打刻経路で共通）。
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

    // (7) LINE通知（ベストエフォート。通知失敗で打刻は失敗させない）
    if (isLineConfigured()) {
      try {
        const driverName = ctx.displayName ?? "ドライバー";
        if (body.event_type === "loading" || body.event_type === "unloading") {
          await notifyBusinessReport({
            driverName,
            eventType: body.event_type,
            vehicleNo: body.vehicle_no,
            place: result.address ?? body.address, // F-22で補完した住所を優先
            lat: body.lat,
            lng: body.lng,
            items: body.items,
          });
        }
        const violations = (result.close?.judgement.items ?? [])
          .filter((i) => i.severity !== "info")
          .map((i) => ({ message: i.message }));
        if (violations.length) {
          await notifyWarning({
            driverName,
            workDate: toWorkDate(body.occurred_at),
            violations,
          });
        }
      } catch (e) {
        console.error("[line] 通知失敗（打刻は成功）", e);
      }
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
