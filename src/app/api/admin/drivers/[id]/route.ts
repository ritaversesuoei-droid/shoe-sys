import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { driverUpdateSchema } from "@/lib/validation";

/** PATCH /api/admin/drivers/:id  ドライバー更新（在籍切替・既定車番等） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = driverUpdateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drivers")
      .update(body)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("ドライバーが見つかりません", 404);
    return ok({ driver: data });
  });
}
