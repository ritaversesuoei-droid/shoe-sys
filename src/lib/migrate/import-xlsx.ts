import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import { cleanText, cleanCode, parseDateLoose, parseNumberLoose, normTime, addDays } from "./cleanse";
import { toJstIso } from "./xlsx";
import { to_month_key } from "@/lib/datekey";
import { parseTimeToMinutes } from "@/lib/time";
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

/** 客先マスタ → customers（客先名/荷主名 → name・屋号。住所/郵便番号があれば取り込む。F-22 照合に利用）。 */
export async function importCustomers(sb: SB, rows: Row[]): Promise<number> {
  let inserted = 0;
  for (const r of rows) {
    // 列名は現行ブックにより「客先名」または「荷主名」。customerName も許容。
    const name = cleanText(r["客先名"] || r["荷主名"] || r["customerName"]);
    if (!name) continue;
    const { data: ex } = await sb.from("customers").select("id").eq("name", name).limit(1).maybeSingle();
    if (ex) continue;
    const address = cleanText(r["住所"]) || null;
    const postal = cleanText(r["郵便番号"]) || null;
    const { error } = await sb.from("customers").insert({ name, yago: name, address, postal_code: postal });
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
): Promise<{ inserted: number; updated: number; skipped: number; driverIds: string[] }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const insertedDrivers = new Set<string>();

  // 冪等判定用に既存 shift の (driver, work_date, clock_in) を一括プリロード（行毎SELECTを回避）。
  // clock_in は tz 表現が揺れるため epoch(ms) をキーに使い、表現差を吸収する。
  type Existing = {
    id: string;
    clock_out_at: string | null;
    edited_in: string | null;
    edited_out: string | null;
    rest_time: string | null;
  };
  const existing = new Map<string, Existing>();
  const shiftKey = (driverId: string, workDate: string, clockInIso: string) =>
    `${driverId}|${workDate}|${new Date(clockInIso).getTime()}`;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("shifts")
      .select("id, driver_id, work_date, clock_in_at, clock_out_at, edited_in, edited_out, rest_time")
      .order("id", { ascending: true }) // 安定ソート必須（無いとページ境界で取りこぼし→重複INSERT）
      .range(from, from + 999);
    if (error) throw error;
    for (const s of data ?? []) {
      if (s.clock_in_at)
        existing.set(shiftKey(s.driver_id, s.work_date, s.clock_in_at), {
          id: s.id,
          clock_out_at: s.clock_out_at,
          edited_in: s.edited_in,
          edited_out: s.edited_out,
          rest_time: s.rest_time,
        });
    }
    if (!data || data.length < 1000) break;
  }

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

    const actualIn = normTime(r["実績出勤"]);
    const actualOut = normTime(r["実績退勤"]);
    const editedIn = normTime(r["修正出勤"]);
    const editedOut = normTime(r["修正退勤"]);
    const rest = normTime(r["休憩時間"]);
    const newEditedIn = editedIn ? `${editedIn}:00` : null;
    const newEditedOut = editedOut ? `${editedOut}:00` : null;
    const newRest = rest ? `${rest}:00` : "0";
    const revisionStatus = editedIn || editedOut ? "edited" : "none";

    const key = shiftKey(driverId, workDate, clockIn);
    const prev = existing.get(key);
    if (prev) {
      // 既存行でも、シート側の後追い記入（特に 確定退勤 null→非null）や修正/休憩の変更は反映する。
      //   これをしないと退勤後記入の勤務が clock_out_at=null のまま recompute 対象外となり、
      //   拘束/労働/深夜/違反判定から丸ごと脱落する（並行運用の毎時ミラーで日常的に発生）。
      const clockOutChanged =
        clockOut != null &&
        (prev.clock_out_at == null ||
          new Date(clockOut).getTime() !== new Date(prev.clock_out_at).getTime());
      // 時刻/休憩は保存形式が揺れる（interval "0"↔"00:00:00"、time の桁/秒揺れ）ため分数に正規化して比較。
      //   文字列直比較だと毎回「変化あり」と誤判定し、無駄な UPDATE と全再計算のスラッシングになる。
      const toMin = (v: string | null): number => {
        const m = v ? /^(\d{1,2}):(\d{2})/.exec(v) : null;
        return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
      };
      const editedChanged =
        (prev.edited_in == null) !== (newEditedIn == null) ||
        (prev.edited_out == null) !== (newEditedOut == null) ||
        toMin(prev.edited_in) !== toMin(newEditedIn) ||
        toMin(prev.edited_out) !== toMin(newEditedOut);
      const changed = clockOutChanged || editedChanged || toMin(prev.rest_time) !== toMin(newRest);
      if (!changed) {
        skipped += 1;
        continue;
      }
      const { error } = await sb
        .from("shifts")
        .update({
          ...(clockOut != null ? { clock_out_at: clockOut } : {}), // シートが空の間は既存の退勤を消さない
          actual_in: actualIn ? `${actualIn}:00` : null,
          actual_out: actualOut ? `${actualOut}:00` : null,
          edited_in: newEditedIn,
          edited_out: newEditedOut,
          rest_time: newRest,
          revision_status: revisionStatus,
        })
        .eq("id", prev.id);
      if (error) throw error;
      updated += 1;
      insertedDrivers.add(driverId); // 更新した driver も再計算対象に含める
      continue;
    }

    const { data: ins, error } = await sb
      .from("shifts")
      .insert({
        driver_id: driverId,
        work_date: workDate,
        month_key: r["月キー"]?.trim() || to_month_key(`${workDate}T00:00:00+09:00`),
        clock_in_at: clockIn,
        clock_out_at: clockOut,
        actual_in: actualIn ? `${actualIn}:00` : null,
        actual_out: actualOut ? `${actualOut}:00` : null,
        edited_in: newEditedIn,
        edited_out: newEditedOut,
        rest_time: newRest,
        revision_status: revisionStatus,
      })
      .select("id")
      .single();
    if (error) throw error;
    inserted += 1;
    insertedDrivers.add(driverId);
    existing.set(key, {
      id: ins?.id ?? "",
      clock_out_at: clockOut,
      edited_in: newEditedIn,
      edited_out: newEditedOut,
      rest_time: newRest,
    });
  }
  return { inserted, updated, skipped, driverIds: [...insertedDrivers] };
}

/**
 * 修正入力シート → shifts（shift_log に無い期間の補完用）。
 * 確定列が無いため時刻ベースで構築（修正値優先・退勤<出勤 かつ補正0 で翌日跨ぎ）。headerRow=3。
 */
export async function importEditInput(
  sb: SB,
  rows: Row[],
  resolver: ReturnType<typeof createDriverResolver>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const workDate = parseDateLoose(r["開始日"]);
    const name = cleanText(r["ドライバー名"]);
    const actualIn = normTime(r["実績出勤"]);
    const actualOut = normTime(r["実績退勤"]);
    if (!workDate || !name || !actualIn || !actualOut) {
      skipped += 1;
      continue;
    }
    const editedIn = normTime(r["修正出勤"]);
    const editedOut = normTime(r["修正退勤"]);
    const inAdj = parseNumberLoose(r["補正(出勤)"]) ?? 0;
    const outAdj = parseNumberLoose(r["補正(退勤)"]) ?? 0;
    const rest = normTime(r["休憩時間"]);
    const driverId = (await resolver.resolve(name, { affiliation: "昭栄運輸", create: true }))!;

    const { data: dup } = await sb
      .from("shifts")
      .select("id")
      .eq("driver_id", driverId)
      .eq("work_date", workDate)
      .eq("actual_in", `${actualIn}:00`)
      .limit(1)
      .maybeSingle();
    if (dup) {
      skipped += 1;
      continue;
    }

    const inTime = editedIn ?? actualIn;
    const outTime = editedOut ?? actualOut;
    const crossNext = (parseTimeToMinutes(outTime) ?? 0) < (parseTimeToMinutes(inTime) ?? 0) && outAdj === 0;

    const { error } = await sb.from("shifts").insert({
      driver_id: driverId,
      work_date: workDate,
      month_key: to_month_key(`${workDate}T00:00:00+09:00`),
      clock_in_at: `${addDays(workDate, inAdj)}T${inTime}:00+09:00`,
      clock_out_at: `${addDays(workDate, outAdj + (crossNext ? 1 : 0))}T${outTime}:00+09:00`,
      actual_in: `${actualIn}:00`,
      actual_out: `${actualOut}:00`,
      edited_in: editedIn ? `${editedIn}:00` : null,
      edited_out: editedOut ? `${editedOut}:00` : null,
      edited_in_adj_days: inAdj,
      edited_out_adj_days: outAdj,
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
    const isSub = !!affiliation && !affiliation.includes(HOME);
    // 子車（外注）は drivers マスタに作らず driver_name_raw で表示。自社のみ driver_id 連結。
    const driverId = !isSub && name ? await resolver.resolve(name, { affiliation, create: true }) : null;
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
      is_subcontract: isSub,
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
