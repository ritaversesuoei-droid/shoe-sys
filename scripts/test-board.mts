/**
 * 運行盤面 集計 検証（仕様書 F-15）。実行: npm run test:board
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";
import { getTodayBoard } from "@/lib/operations/board";
import { toWorkDate } from "@/lib/datekey";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const drivers: string[] = [];
function punch(t: PunchInput["event_type"], at: string, extra: Partial<PunchInput> = {}): PunchInput {
  return { idempotency_key: randomUUID(), event_type: t, occurred_at: at, ...extra };
}

async function main() {
  const s = Date.now();
  const { data: d } = await sb.from("drivers").insert({ code: `BD${s % 100000}`, name: `TEST_BOARD_${s}` }).select("id").single();
  const A = d!.id;
  drivers.push(A);

  const now = Date.now();
  const iso = (offsetSec: number) => new Date(now + offsetSec * 1000).toISOString();
  const today = toWorkDate(new Date(now));

  await processPunch(sb, A, punch("departure", iso(0), { vehicle_no: "1001" }));
  await processPunch(sb, A, punch("loading", iso(1), { vehicle_no: "1001", items: [{ shipper: "X" }] }));

  let board = await getTodayBoard(sb, today);
  let entry = board.find((b) => b.driverId === A);
  check("盤面にドライバーが現れる", !!entry, board.length);
  check("状態=稼働中(active)", entry?.status === "active", entry?.status);
  check("最新打刻=積込", entry?.lastEventLabel === "積込", entry?.lastEventLabel);
  check("打刻件数=2", entry?.eventCount === 2, entry?.eventCount);

  await processPunch(sb, A, punch("clock_out", iso(2), { vehicle_no: "1001" }));
  board = await getTodayBoard(sb, today);
  entry = board.find((b) => b.driverId === A);
  check("退勤後は状態=終業(done)", entry?.status === "done", entry?.status);
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
