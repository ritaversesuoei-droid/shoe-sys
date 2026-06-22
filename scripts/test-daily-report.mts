/**
 * 日報フロー 実DB結合テスト（仕様書 F-10 / 4.6）。
 * 実行: npm run test:daily
 *   打刻(processPunch) → 自動生成(assembleDailyReport) → 保存/確定(saveDailyReport) の縦の流れを検証。
 *   テストデータは finally で必ず削除。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";
import { assembleDailyReport, saveDailyReport } from "@/lib/operations/daily-report";
import { AppError } from "@/lib/errors";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail ?? ""); }
}
function punch(t: PunchInput["event_type"], at: string, extra: Partial<PunchInput> = {}): PunchInput {
  return { idempotency_key: randomUUID(), event_type: t, occurred_at: at, ...extra };
}

const drivers: string[] = [];
async function makeDriver(code: string, name: string): Promise<string> {
  const { data, error } = await sb.from("drivers").insert({ code, name }).select("id").single();
  if (error || !data) throw error ?? new Error("driver作成失敗");
  drivers.push(data.id);
  return data.id;
}

async function main() {
  const s = Date.now();
  const A = await makeDriver(`DA${s % 100000}`, `TEST_DR_A_${s}`);
  const C = await makeDriver(`DC${s % 100000}`, `TEST_DR_C_${s}`);

  console.log("\n[1] 通常運行の打刻 → 日報 自動生成");
  await processPunch(sb, A, punch("departure", "2026-06-20T06:00:00+09:00", { vehicle_no: "1001" }));
  await processPunch(sb, A, punch("loading", "2026-06-20T09:00:00+09:00", {
    vehicle_no: "1001",
    items: [
      { shipper: "荷主X", delivery_spot: "江東区", quantity: "10", weight: "2t", slip_no: "S1" },
      { shipper: "荷主Y", delivery_spot: "品川区", quantity: "5", weight: "1t", slip_no: "S2" },
    ],
  }));
  await processPunch(sb, A, punch("unloading", "2026-06-20T13:00:00+09:00", { vehicle_no: "1001", address: "横浜市" }));
  await processPunch(sb, A, punch("clock_out", "2026-06-20T18:00:00+09:00", { vehicle_no: "1001" }));

  const gen = await assembleDailyReport(sb, A, "2026-06-20");
  check("自動生成された(generated=true)", gen?.generated === true);
  check("明細3行(積込2明細+荷卸1)", gen?.legs.length === 3, gen?.legs.length);
  check("車番が補完される", gen?.vehicle_no === "1001", gen?.vehicle_no);
  check("総出庫/総帰庫が設定", !!gen?.departure_at && !!gen?.return_at);

  console.log("\n[2] 下書き保存 → 復元");
  const saved = await saveDailyReport(sb, A, {
    report_date: "2026-06-20",
    status: "draft",
    shift_id: gen!.shift_id ?? undefined,
    vehicle_no: "1001",
    meter_start: 1000,
    legs: gen!.legs,
    rests: [],
  });
  check("保存後はgenerated=false(既存復元)", saved.generated === false);
  check("idが採番される", !!saved.id);
  check("ステータスはdraft", saved.status === "draft");

  console.log("\n[3] 確定バリデーション（不備）");
  let threw = false;
  let msg = "";
  try {
    await saveDailyReport(sb, A, {
      id: saved.id ?? undefined,
      report_date: "2026-06-20",
      status: "confirmed",
      vehicle_no: "1001",
      meter_start: 1000,
      // meter_end 無し / 休憩90分未満
      legs: gen!.legs,
      rests: [],
    });
  } catch (e) {
    threw = true;
    msg = e instanceof AppError ? e.message : String(e);
  }
  check("不備のある確定はAppError(422)で拒否", threw, msg);
  check("メッセージに終了メーター/休憩90分", /終了メーター/.test(msg) && /90分/.test(msg), msg);

  console.log("\n[4] 確定（適正）");
  const confirmed = await saveDailyReport(sb, A, {
    id: saved.id ?? undefined,
    report_date: "2026-06-20",
    status: "confirmed",
    vehicle_no: "1001",
    meter_start: 1000,
    meter_end: 1300,
    legs: gen!.legs,
    rests: [
      { rest_type: "rest", place: "SA海老名", start_at: "2026-06-20T11:00:00+09:00", end_at: "2026-06-20T13:00:00+09:00", duration_min: 120 },
    ],
  });
  check("ステータスがconfirmed", confirmed.status === "confirmed");
  const { data: row } = await sb.from("daily_reports").select("confirmed_at, rest_total_min").eq("id", saved.id!).single();
  check("confirmed_atが記録", !!row?.confirmed_at, row?.confirmed_at);
  check("休憩合計120分が記録", row?.rest_total_min === 120, row?.rest_total_min);

  console.log("\n[5] 長距離運行: 休憩跨ぎの連結 + 睡眠カード生成");
  await processPunch(sb, C, punch("departure", "2026-06-22T06:00:00+09:00", { vehicle_no: "2001" }));
  await processPunch(sb, C, punch("long_rest", "2026-06-22T20:00:00+09:00", { vehicle_no: "2001", address: "浜松SA", alcohol_checked: true }));
  await processPunch(sb, C, punch("leg_departure", "2026-06-23T05:00:00+09:00", { vehicle_no: "2001", alcohol_checked: true }));
  await processPunch(sb, C, punch("clock_out", "2026-06-23T15:00:00+09:00", { vehicle_no: "2001" }));
  const trip = await assembleDailyReport(sb, C, "2026-06-22");
  check("睡眠カードが1枚生成(長距離休憩)", trip?.rests.length === 1, trip?.rests.length);
  check("睡眠カードの休憩=540分(20:00→翌05:00)", trip?.rests[0]?.duration_min === 540, trip?.rests[0]?.duration_min);

  console.log("\n[6] メーター補完: 前回終了メーターを開始へ");
  await processPunch(sb, A, punch("departure", "2026-06-25T08:00:00+09:00", { vehicle_no: "1001" }));
  await processPunch(sb, A, punch("clock_out", "2026-06-25T18:00:00+09:00", { vehicle_no: "1001" }));
  const gen2 = await assembleDailyReport(sb, A, "2026-06-25");
  check("開始メーターが前回終了(1300)で補完", gen2?.meter_start === 1300, gen2?.meter_start);
}

async function cleanup() {
  for (const id of drivers) {
    // daily_reports 配下(legs/rests)はFK cascade。日報→events→shifts→alerts→driver の順で削除
    await sb.from("daily_reports").delete().eq("driver_id", id);
    await sb.from("events").delete().eq("driver_id", id);
    await sb.from("compliance_alerts").delete().eq("driver_id", id);
    await sb.from("shifts").delete().eq("driver_id", id);
    await sb.from("drivers").delete().eq("id", id);
  }
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
