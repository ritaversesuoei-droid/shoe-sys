import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  yago: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

/** PATCH /api/admin/customers/:id  客先更新 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from("customers").update(body).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return fail("客先が見つかりません", 404);
    return ok({ customer: data });
  });
}

/** DELETE /api/admin/customers/:id  客先削除（打刻等で参照中は不可） */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const supabase = await createClient();
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") return fail("この客先は打刻データ等で使用中のため削除できません", 409);
      throw error;
    }
    return ok({ id });
  });
}
