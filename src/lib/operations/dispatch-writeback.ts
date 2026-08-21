import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

/**
 * 配車（流れ表）書き戻しペイロード。指定日の dispatch_plans を「流れ表シート」の列順で組み立てる。
 * 列順（現行 dispatch-map と同じ）:
 *   [所属, ドライバー名, 携帯, 車両NO, 積込日, 荷主, 積地, 着荷日, 着荷地, 注意/到着時間, 高速, 表示順]
 * GAS 側は op=dispatch_replace を受け、積込日=date の行を消して rows で置き換える。
 */
export async function buildDispatchWriteback(sb: SB, date: string): Promise<{ op: "dispatch_replace"; date: string; rows: (string | number)[][] }> {
  const { data, error } = await sb
    .from("dispatch_plans")
    .select("plan_date, arrival_date, driver_name_raw, vehicle_no, shipper, origin_spot, delivery_spot, arrival_time, highway_instruction, is_subcontract, sort_no, drivers(name)")
    .eq("plan_date", date)
    .order("is_subcontract", { ascending: true })
    .order("sort_no", { ascending: true, nullsFirst: false })
    .order("driver_name_raw", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []).map((r) => {
    const name = (r.drivers as { name: string } | null)?.name ?? r.driver_name_raw ?? "";
    return [
      r.is_subcontract ? "協力会社" : "昭栄運輸", // 所属（「昭栄」を含めば自社と判定される）
      name,
      "", // 携帯
      r.vehicle_no ?? "",
      r.plan_date ?? "",
      r.shipper ?? "",
      r.origin_spot ?? "",
      r.arrival_date ?? "",
      r.delivery_spot ?? "",
      r.arrival_time ?? "",
      r.highway_instruction ?? "",
      r.sort_no ?? "",
    ];
  });
  return { op: "dispatch_replace", date, rows };
}
