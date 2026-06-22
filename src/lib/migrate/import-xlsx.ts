import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import { cleanText, cleanCode, parseDateLoose, normTime } from "./cleanse";
import { toJstIso } from "./xlsx";
import { to_month_key } from "@/lib/datekey";
import { createDriverResolver } from "./roster";

type SB = SupabaseClient<Database>;
type Row = Record<string, string>;

const HOME = "昭栄"; // 自社判定キー（昭栄運輸 / 昭栄（九州））

/** drivers シート → drivers（code=driver_id, line_chat_url=line_ID, default_vehicle_no=car_No）。 */
export async function importDrivers(sb: SB, rows: Row[]): Promise<number> {
  const payload: TablesInsert<"drivers">[] = [];
  for (const r of rows) {
    const code = cleanCode(r["driver_id"]);
    const name = cleanText(r["driver_name"]);
    if (!code || !name) continue;
    payload.push({
      code,
      name,
      line_chat_url: r["line_ID"] ? r["line_ID"].trim() : null,
      default_vehicle_no: r["car_No"] ? cleanCode(r["car_No"]) : null,
      affiliation: "昭栄運輸",
      is_active: true,
    });
  }
  if (payload.length) {
    const { error } = await sb.from("drivers").upsert(payload, { onConflict: "code" });
    if (error) throw error;
  }
  return payload.length;
}

/** vehicles シート → vehicles。 */
export async function importVehicles(sb: SB, rows: Row[]): Promise<number> {
  const payload: TablesInsert<"vehicles">[] = [];
  for (const r of rows) {
    const vehicle_no = cleanCode(r["vehicle_no"]);
    if (!vehicle_no) continue;
    const active = r["active_flag"];
    payload.push({
      vehicle_no,
      name: r["note"] ? cleanText(r["note"]) : null,
      is_active: active ? /^(1|true|有効|稼働)/i.test(active.trim()) : true,
    });
  }
  if (payload.length) {
    const { error } = await sb.from("vehicles").upsert(payload, { onConflict: "vehicle_no" });
    if (error) throw error;
  }
  return payload.length;
}

/** 客先マスタ → customers（荷主名 / 屋号=荷主名 で F-22 照合に利用）。 */
export async function importCustomers(sb: SB, rows: Row[]): Promise<number> {
  let inserted = 0;
  for (const r of rows) {
    const name = cleanText(r["荷主名"]);
    if (!name) continue;
    const { data: ex } = await sb.from("customers").select("id").eq("name", name).limit(1).maybeSingle();
    if (ex) continue;
    const { error } = await sb.from("customers").insert({ name, yago: name });
    if (error) throw error;
    inserted += 1;
  }
  return inserted;
}

/** shift_log → shifts（確定出勤/確定退勤を clock_in/out に。日跨ぎは確定済）。 */
export async function importShiftLog(
  sb: SB,
  rows: Row[],
  resolver: ReturnType<typeof createDriverResolver>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const name = cleanText(r["ドライバー名"]);
    const workDate = parseDateLoose(r["開始日"]);
    const clockIn = toJstIso(r["確定出勤"]);
    if (!name || !workDate || !clockIn) {
      skipped += 1;
      continue;
    }
    const clockOut = toJstIso(r["確定退勤"]);
    const driverId = (await resolver.resolve(name, { affiliation: "昭栄運輸", create: true }))!;

    const { data: dup } = await sb
      .from("shifts")
      .select("id")
      .eq("driver_id", driverId)
      .eq("work_date", workDate)
      .eq("clock_in_at", clockIn)
      .limit(1)
      .maybeSingle();
    if (dup) {
      skipped += 1;
      continue;
    }

    const actualIn = normTime(r["実績出勤"]);
    const actualOut = normTime(r["実績退勤"]);
    const editedIn = normTime(r["修正出勤"]);
    const editedOut = normTime(r["修正退勤"]);
    const rest = normTime(r["休憩時間"]);

    const { error } = await sb.from("shifts").insert({
      driver_id: driverId,
      work_date: workDate,
      month_key: r["月キー"]?.trim() || to_month_key(`${workDate}T00:00:00+09:00`),
      clock_in_at: clockIn,
      clock_out_at: clockOut,
      actual_in: actualIn ? `${actualIn}:00` : null,
      actual_out: actualOut ? `${actualOut}:00` : null,
      edited_in: editedIn ? `${editedIn}:00` : null,
      edited_out: editedOut ? `${editedOut}:00` : null,
      rest_time: rest ? `${rest}:00` : "0",
      revision_status: editedIn || editedOut ? "edited" : "none",
    });
    if (error) throw error;
    inserted += 1;
  }
  return { inserted, skipped };
}

/** 運行データ → dispatch_plans（所属に「昭栄」を含まなければ子車）。 */
export async function importDispatchSheet(
  sb: SB,
  rows: Row[],
  resolver: ReturnType<typeof createDriverResolver>,
  opts: { reset?: boolean } = {},
): Promise<number> {
  if (opts.reset) await sb.from("dispatch_plans").delete().not("id", "is", null);

  const payload: TablesInsert<"dispatch_plans">[] = [];
  for (const r of rows) {
    const planDate = parseDateLoose(r["積込日"]);
    if (!planDate) continue;
    const affiliation = cleanText(r["所属"]);
    const name = cleanText(r["ドライバー名"]);
    const driverId = name ? await resolver.resolve(name, { affiliation, create: true }) : null;
    const note = [
      cleanText(r["注意事項"]),
      r["積地（住所）"] ? `発:${cleanText(r["積地（住所）"])}` : "",
      r["着荷日"] ? `着日:${parseDateLoose(r["着荷日"]) ?? ""}` : "",
      r["表示順"] ? `順:${cleanText(r["表示順"])}` : "",
    ].filter(Boolean).join(" / ");

    payload.push({
      plan_date: planDate,
      driver_id: driverId,
      driver_name_raw: name || null,
      vehicle_no: cleanCode(r["車両NO"]) || null,
      shipper: cleanText(r["荷主名"]) || null,
      delivery_spot: cleanText(r["着荷地（会社名）"]) || null,
      highway_instruction: cleanText(r["高速指示"]) || null,
      is_subcontract: !!affiliation && !affiliation.includes(HOME),
      note: note || null,
    });
  }
  let inserted = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await sb.from("dispatch_plans").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}
