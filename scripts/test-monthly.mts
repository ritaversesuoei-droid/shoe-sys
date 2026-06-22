/**
 * 月次集計 実DB結合テスト（仕様書 F-14）。実行: npm run test:monthly
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));
const punch = (t: PunchInput["event_type"], at: string, extra: Partial<PunchInput> = {}): PunchInput => ({
  idempotency_key: randomUUID(),
  event_type: t,
  occurred_at: at,
  ...extra,
});
const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const drivers: string[] = [];

async function main() {
  const s = Date.now();
  const { data: d } = await sb.from("drivers").insert({ code: `MS${s % 100000}`, name: `TEST_MONTH_${s}` }).select("id").single();
  const A = d!.id;
  drivers.push(A);

  // 3勤務（時系列順）。restraint は出退勤の差で決まる。
  const days = [
    { date: "2026-06-10", in: "2026-06-10T08:00:00+09:00", out: "2026-06-10T20:00:00+09:00", restraint: 720, night: 0 },
    { date: "2026-06-11", in: "2026-06-11T06:00:00+09:00", out: "2026-06-12T00:00:00+09:00", restraint: 1080, night: 120 }, // 18h, 違反, 深夜120
    { date: "2026-06-13", in: "2026-06-13T08:00:00+09:00", out: "2026-06-13T18:00:00+09:00", restraint: 600, night: 0 },
  ];
  for (const day of days) {
    await processPunch(sb, A, punch("departure", day.in, { vehicle_no: "1001" }));
    await processPunch(sb, A, punch("clock_out", day.out, { vehicle_no: "1001" }));
  }

  const summary = await getMonthlySummary(sb, "202606", A);
  const m = summary.find((x) => x.driverId === A);
  check("対象ドライバーが集計に出る", !!m, summary.length);

  const expRestraint = days.reduce((s, d) => s + d.restraint, 0);
  const expLabor = expRestraint; // 休憩0
  const expOvertime = days.reduce((s, d) => s + Math.max(0, d.restraint - 480), 0);
  const expHoliday = days.filter((d) => isWeekend(d.date)).reduce((s, d) => s + d.restraint, 0);
  const expNight = days.reduce((s, d) => s + d.night, 0);

  check("出勤日数=3", m?.workDays === 3, m?.workDays);
  check(`拘束合計=${expRestraint}`, m?.restraintMin === expRestraint, m?.restraintMin);
  check(`労働合計=${expLabor}`, m?.laborMin === expLabor, m?.laborMin);
  check(`残業合計=${expOvertime}`, m?.overtimeMin === expOvertime, m?.overtimeMin);
  check(`休日労働=${expHoliday}(土日)`, m?.holidayWorkMin === expHoliday, m?.holidayWorkMin);
  check(`深夜合計=${expNight}`, m?.nightMin === expNight, m?.nightMin);
  check("違反件数=1（18h勤務）", m?.violationCount === 1, m?.violationCount);
  check("日別詳細=3件", m?.byDay.length === 3, m?.byDay.length);
}

async function cleanup() {
  for (const id of drivers) {
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
