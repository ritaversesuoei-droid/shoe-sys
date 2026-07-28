import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, handle } from "@/lib/api/response";
import type { TablesUpdate } from "@/types/database";
import { z } from "zod";

/** LOGI-FLOW: 1案件のセル修正（PATCH）・削除（DELETE）。管理者のみ・service_role。 */
const patchSchema = z.object({
  shipper: z.string().nullish(),
  origin_spot: z.string().nullish(),
  delivery_spot: z.string().nullish(),
  arrival_time: z.string().nullish(),
  highway_instruction: z.string().nullish(),
  vehicle_no: z.string().nullish(),
  plan_date: z.string().nullish(),
  arrival_date: z.string().nullish(),
  sort_no: z.number().int().nullish(),
  // 配車表の編集で使う列
  note: z.string().nullish(),
  is_subcontract: z.boolean().nullish(),
  driver_name_raw: z.string().nullish(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as TablesUpdate<"dispatch_plans">;
    const admin = createAdminClient();
    const { error } = await admin.from("dispatch_plans").update(patch).eq("id", id);
    if (error) throw error;
    return ok({ id });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.from("dispatch_plans").delete().eq("id", id);
    if (error) throw error;
    return ok({ id, deleted: true });
  });
}
