/**
 * 拘束14h超「週2回まで」週次判定 検証（仕様書 6.3）。実行: npm run test:weekly
 *   同一週で3回目の14h超を違反に格上げできるか。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";

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
  idempotency_key: randomUUID(), event_type: t, occurred_at: at, ...extra,
});
const drivers: string[] = [];

// 14.5h勤務（06:00-20:30 = 870分, 840<870<900 → 拘束超過だが上限内）
async function workday(driverId: string, date: string) {
  await processPunch(sb, driverId, punch("departure", `${date}T06:00:00+09:00`, { vehicle_no: "1001" }));
  return processPunch(sb, driverId, punch("clock_out", `${date}T20:30:00+09:00`, { vehicle_no: "1001" }));
}
function restraintSeverity(r: Awaited<ReturnType<typeof workday>>): string | undefined {
  return r.close?.judgement.items.find((i) => i.type === "restraint")?.severity;
}

async function main() {
  const s = Date.now();
  const { data: d } = await sb.from("drivers").insert({ code: `WK${s % 100000}`, name: `TEST_WEEK_${s}` }).select("id").single();
  const A = d!.id;
  drivers.push(A);

  // 同一週（2026-06-15 火, 06-17 木, 06-19 土 は Mon 06-15? の同週内）
  const r1 = await workday(A, "2026-06-15");
  const r2 = await workday(A, "2026-06-17");
  const r3 = await workday(A, "2026-06-19");

  check("1回目の14h超は警告(warning)", restraintSeverity(r1) === "warning", restraintSeverity(r1));
  check("2回目の14h超は警告(warning)", restraintSeverity(r2) === "warning", restraintSeverity(r2));
  check("3回目の14h超は違反(violation)", restraintSeverity(r3) === "violation", restraintSeverity(r3));
  check("3回目で hasViolation=true", r3.close?.judgement.hasViolation === true, r3.close?.judgement.hasViolation);

  // 翌週はリセット（2026-06-22 月）→ 警告に戻る
  const r4 = await workday(A, "2026-06-22");
  check("翌週はカウントリセット→警告", restraintSeverity(r4) === "warning", restraintSeverity(r4));
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
