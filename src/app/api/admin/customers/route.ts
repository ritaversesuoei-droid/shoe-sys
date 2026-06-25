import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { z } from "zod";

/** GET /api/admin/customers  客先マスタ一覧（F-22 / 客先マスタ） */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return ok({ customers: data ?? [] });
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  yago: z.string().optional(),
  postal_code: z.string().optional(),
  address: z.string().optional(),
});

/** POST /api/admin/customers  客先作成 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: body.name,
        yago: body.yago ?? body.name, // 屋号未指定は客先名（F-22 照合キー）
        postal_code: body.postal_code ?? null,
        address: body.address ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ customer: data }, 201);
  });
}
