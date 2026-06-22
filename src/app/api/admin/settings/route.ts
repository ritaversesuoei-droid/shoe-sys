import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";

/** GET /api/admin/settings  システム設定一覧（管理者 / 設定変更） */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .order("key", { ascending: true });
    if (error) throw error;
    return ok({ settings: data ?? [] });
  });
}
