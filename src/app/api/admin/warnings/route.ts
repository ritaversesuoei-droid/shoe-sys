import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";

/**
 * GET /api/admin/warnings?month=yyyyMM&status=open|resolved  警告一覧（仕様書 F-13, 8.1）
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const status = url.searchParams.get("status");

    const supabase = await createClient();
    let query = supabase
      .from("compliance_alerts")
      .select("*, drivers(code, name)")
      .order("work_date", { ascending: false });
    if (month) query = query.eq("month_key", month);
    if (status === "open" || status === "resolved") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return ok({ warnings: data ?? [] });
  });
}
