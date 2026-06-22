import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOfficeToken } from "@/lib/office";
import { ok, handle } from "@/lib/api/response";

/**
 * GET /api/office/drivers  据置端末用 ドライバー一覧（仕様書 S-08）
 * 端末トークンで認証し、在籍ドライバーを返す（選択肢）。service_role で参照。
 */
export async function GET(request: Request) {
  return handle(async () => {
    verifyOfficeToken(request);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("drivers")
      .select("id, code, name, default_vehicle_no")
      .eq("is_active", true)
      .order("code", { ascending: true });
    if (error) throw error;
    return ok({ drivers: data ?? [] });
  });
}
