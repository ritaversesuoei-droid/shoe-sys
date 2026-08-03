import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { multicastTo } from "@/lib/line/client";
import { isReplyConfigured } from "@/lib/line/notify";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";

// 外部API呼び出しのため Node
export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ message: z.string().trim().min(1).max(1000) });

/**
 * POST /api/admin/line/broadcast  連携済み全ドライバーへ一斉配信（一斉周知 / F-16 拡張）。
 *   管理者のみ。multicast で送信し、月次使用量にも計上される。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    if (!isReplyConfigured()) return fail("LINEトークンが未設定です", 503);

    const { message } = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: drivers } = await admin
      .from("drivers")
      .select("line_user_id")
      .eq("is_active", true)
      .not("line_user_id", "is", null);

    const ids = (drivers ?? []).map((d) => d.line_user_id).filter((v): v is string => !!v);
    if (ids.length === 0) return ok({ sent: 0, note: "LINE連携済みのドライバーがいません" });

    const sent = await multicastTo(ids, [{ type: "text", text: message }]);
    return ok({ sent });
  });
}
