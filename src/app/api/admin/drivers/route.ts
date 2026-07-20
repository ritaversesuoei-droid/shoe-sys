import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { driverCreateSchema } from "@/lib/validation";

/** GET /api/admin/drivers  ドライバーマスタ一覧（管理者 / マスタ管理） */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .order("code", { ascending: true });
    if (error) throw error;
    return ok({ drivers: data ?? [] });
  });
}

/** POST /api/admin/drivers  ドライバー作成 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = driverCreateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drivers")
      .insert({
        code: body.code,
        name: body.name,
        default_vehicle_no: body.default_vehicle_no ?? null,
        affiliation: body.affiliation ?? null,
        line_user_id: body.line_user_id ?? null,
        manage_attendance: body.manage_attendance ?? true,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail("その業務IDは既に使われています", 409);
      throw error;
    }
    return ok({ driver: data }, 201);
  });
}
