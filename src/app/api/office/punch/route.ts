import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOfficeToken } from "@/lib/office";
import { ok, handle } from "@/lib/api/response";
import { processPunch } from "@/lib/operations/punch";

/**
 * POST /api/office/punch  据置端末からの代行打刻（仕様書 S-09 / F-02,F-06）
 * 端末トークンで認証し、選択ドライバーの 出庫(departure)/退勤(clock_out) のみを
 * service_role で代行記録する（端末は per-driver セッションを持たないため）。
 */
const schema = z.object({
  idempotency_key: z.string().uuid(),
  driver_id: z.string().uuid(),
  event_type: z.enum(["departure", "clock_out"]), // 据置端末は出退勤のみ
  vehicle_no: z.string().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    verifyOfficeToken(request);
    const body = schema.parse(await request.json());
    const admin = createAdminClient();
    const result = await processPunch(admin, body.driver_id, {
      idempotency_key: body.idempotency_key,
      event_type: body.event_type,
      occurred_at: new Date().toISOString(),
      vehicle_no: body.vehicle_no,
    });
    return ok({ eventId: result.eventId, shiftId: result.shiftId, deduped: result.deduped ?? false });
  });
}
