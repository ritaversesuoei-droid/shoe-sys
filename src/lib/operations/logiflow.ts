import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

export interface LFJob {
  id: string;
  planDate: string; // 積込日
  arrivalDate: string; // 着荷日（null時=積込日）
  vehicleNo: string | null;
  shipper: string | null; // 荷主
  originSpot: string | null; // 積地
  destSpot: string | null; // 着荷地
  arrivalTime: string | null; // 到着時間
  express: string | null; // 高速指示
  sortNo: number | null;
  isSubcontract: boolean;
}
export interface LFDriver {
  key: string; // DOM用（空白除去）
  name: string;
  code: string | null;
  belong: string; // 自社 / 協力
  vehicle: string | null;
  amJobs: LFJob[]; // 前日から継続（積込<当日・着荷=当日）
  jobs: LFJob[]; // 当日（積込=当日・着荷=当日）
  nextDayJobs: LFJob[]; // 翌日送り（積込=当日・着荷>当日）
}
export interface LFBoard {
  date: string;
  drivers: LFDriver[];
  totalJobs: number;
}

const bySort = (a: LFJob, b: LFJob) => (a.sortNo ?? 999999) - (b.sortNo ?? 999999);

/**
 * LOGI-FLOW NAVI（流れ表 編集画面）の盤面データ。現行GAS render() のロジックを再現。
 *   指定日に関係する案件（積込日=当日 or 着荷日=当日）をドライバー単位に集約し、
 *   AM(前日継続) / 当日フロー / 翌日 に振り分ける。
 */
export async function getLogiFlowBoard(sb: SB, dateStr: string): Promise<LFBoard> {
  const { data, error } = await sb
    .from("dispatch_plans")
    .select(
      "id, plan_date, arrival_date, driver_id, driver_name_raw, vehicle_no, shipper, origin_spot, delivery_spot, arrival_time, highway_instruction, sort_no, is_subcontract, drivers(name, code, default_vehicle_no)",
    )
    .or(`plan_date.eq.${dateStr},arrival_date.eq.${dateStr}`)
    .order("sort_no", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rows = data ?? [];

  const map = new Map<string, LFDriver>();
  let totalJobs = 0;

  for (const r of rows) {
    const drv = r.drivers as { name: string; code: string; default_vehicle_no: string | null } | null;
    const name = (drv?.name ?? r.driver_name_raw ?? "（ドライバー未定）").trim();
    let d = map.get(name);
    if (!d) {
      d = {
        key: name.replace(/\s/g, "") || "x",
        name,
        code: drv?.code ?? null,
        belong: r.is_subcontract ? "協力" : "自社",
        vehicle: null,
        amJobs: [],
        jobs: [],
        nextDayJobs: [],
      };
      map.set(name, d);
    }
    if (!d.vehicle) d.vehicle = r.vehicle_no ?? drv?.default_vehicle_no ?? null;

    const job: LFJob = {
      id: r.id,
      planDate: r.plan_date,
      arrivalDate: r.arrival_date ?? r.plan_date,
      vehicleNo: r.vehicle_no,
      shipper: r.shipper,
      originSpot: r.origin_spot,
      destSpot: r.delivery_spot,
      arrivalTime: r.arrival_time,
      express: r.highway_instruction,
      sortNo: r.sort_no,
      isSubcontract: r.is_subcontract,
    };
    const lT = r.plan_date;
    const aT = r.arrival_date ?? r.plan_date;
    if (lT < dateStr && aT === dateStr) d.amJobs.push(job);
    else if (lT === dateStr && aT === dateStr) {
      d.jobs.push(job);
      totalJobs++;
    } else if (lT === dateStr && aT > dateStr) {
      d.nextDayJobs.push(job);
      totalJobs++;
    }
  }

  for (const d of map.values()) {
    d.jobs.sort(bySort);
    d.amJobs.sort(bySort);
    d.nextDayJobs.sort(bySort);
  }
  const drivers = [...map.values()].sort(
    (a, b) => (a.code ?? "zzz").localeCompare(b.code ?? "zzz") || a.name.localeCompare(b.name),
  );
  return { date: dateStr, drivers, totalJobs };
}
