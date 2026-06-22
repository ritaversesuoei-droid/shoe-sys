import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { vehicleUpdateSchema } from "@/lib/validation";

/** PATCH /api/admin/vehicles/:id  車両更新（名称・区分・稼働切替） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = vehicleUpdateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .update(body)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("車両が見つかりません", 404);
    return ok({ vehicle: data });
  });
}
