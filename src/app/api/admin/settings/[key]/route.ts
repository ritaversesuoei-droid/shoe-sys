import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { mergeComplianceConfig } from "@/lib/compliance";
import type { Json } from "@/types/database";

/**
 * PUT /api/admin/settings/:key  設定更新（仕様書 F-14基盤 / 12.2-#5 構成管理）
 *   key='compliance' は ComplianceConfig 形に正規化してから保存（壊れた形を防ぐ）。
 *   body: { value: <jsonb>, description?: string }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { key } = await params;
    const body = (await request.json()) as { value?: unknown; description?: string };

    const value: Json =
      key === "compliance"
        ? (mergeComplianceConfig(body.value) as unknown as Json)
        : (body.value as Json);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key, value, description: body.description ?? null }, { onConflict: "key" })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ setting: data });
  });
}
