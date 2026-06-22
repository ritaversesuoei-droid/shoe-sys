import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { vehicleCreateSchema } from "@/lib/validation";

/** GET /api/admin/vehicles  車両マスタ一覧 */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("vehicle_no", { ascending: true });
    if (error) throw error;
    return ok({ vehicles: data ?? [] });
  });
}

/** POST /api/admin/vehicles  車両作成 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = vehicleCreateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ vehicle_no: body.vehicle_no, name: body.name ?? null, kind: body.kind ?? null })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail("その車番は既に登録されています", 409);
      throw error;
    }
    return ok({ vehicle: data }, 201);
  });
}
