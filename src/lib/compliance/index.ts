import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { mergeComplianceConfig, DEFAULT_COMPLIANCE_CONFIG } from "./config";
import type { ComplianceConfig } from "./types";

export * from "./types";
export * from "./calculate";
export { DEFAULT_COMPLIANCE_CONFIG, mergeComplianceConfig } from "./config";

/**
 * app_settings('compliance') から判定パラメータを取得（仕様書 12.2-#5 構成管理）。
 * 取得失敗時はフォールバック既定値。
 */
export async function loadComplianceConfig(
  supabase: SupabaseClient<Database>,
): Promise<ComplianceConfig> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "compliance")
    .maybeSingle();

  if (error || !data) return DEFAULT_COMPLIANCE_CONFIG;
  return mergeComplianceConfig(data.value);
}
