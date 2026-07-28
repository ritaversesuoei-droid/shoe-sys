import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, handle } from "@/lib/api/response";
import { z } from "zod";

/** LOGI-FLOW: 案件の新規追加（POST）・並び順一括更新（PATCH）。管理者のみ・service_role。 */
const addSchema = z.object({
  driver_id: z.string().uuid().nullish(),
  driver_name_raw: z.string().min(1),
  plan_date: z.string(),
  arrival_date: z.string().nullish(),
  is_subcontract: z.boolean().optional(),
});

const reorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), sort_no: z.number().int() })).max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const b = addSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dispatch_plans")
      .insert({
        driver_id: b.driver_id ?? null,
        driver_name_raw: b.driver_name_raw,
        plan_date: b.plan_date,
        arrival_date: b.arrival_date ?? b.plan_date,
        is_subcontract: b.is_subcontract ?? false,
        origin_spot: "新規積地",
        delivery_spot: "新規着地",
      })
      .select("id")
      .single();
    if (error) throw error;
    return ok({ id: data.id }, 201);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { reorder } = reorderSchema.parse(await request.json());
    const admin = createAdminClient();
    for (const r of reorder) {
      const { error } = await admin.from("dispatch_plans").update({ sort_no: r.sort_no }).eq("id", r.id);
      if (error) throw error;
    }
    return ok({ updated: reorder.length });
  });
}
