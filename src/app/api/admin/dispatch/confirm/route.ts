import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setDispatchConfirmed } from "@/lib/operations/dispatch-confirm";
import { ok, handle } from "@/lib/api/response";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmed: z.boolean(),
});

/**
 * POST /api/admin/dispatch/confirm  流れ表の「確定 / 確定解除」（日付単位）。管理者のみ。
 *   確定するとその日付の配車表・流れ表のタイトル帯が赤くなる。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { date, confirmed } = schema.parse(await request.json());
    const admin = createAdminClient();
    await setDispatchConfirmed(admin, date, confirmed);
    return ok({ date, confirmed });
  });
}
