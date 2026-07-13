/**
 * 休憩打刻（rest_start / rest_end）実DB結合テスト（② 現場要望 / migration 0013）。
 * 実行: npm run test:rest
 *   - rest_start/rest_end が「勤務を開閉しない in-shift イベント」として記録されること
 *   - events の CHECK制約(0013)が新種別を受理すること（＝本番migration適用の検証）
 *   - アルコールチェック不要で通ること・退勤で正しくクローズすること
 *   - 終了時にテストデータを必ず削除（finally）。
 * 注意: 実DBに一時データを作成します（クリーンアップ済）。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const sb = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

function punch(event_type: PunchInput["event_type"], occurred_at: string, extra: Partial<PunchInput> = {}): PunchInput {
  return { idempotency_key: randomUUID(), event_type, occurred_at, ...extra };
}

const createdDriverIds: string[] = [];
async function makeDriver(code: string, name: string): Promise<string> {
  const { data, error } = await sb.from("drivers").insert({ code, name }).select("id").single();
  if (error || !data) throw error ?? new Error("driver作成失敗");
  createdDriverIds.push(data.id);
  return data.id;
}

async function main() {
  const stamp = Date.now();
  const A = await makeDriver(`TR${stamp % 100000}`, `TEST_REST_A_${stamp}`);

  console.log("\n[シナリオ] 出勤 → 休憩開始 → 休憩終了 → 退勤");
  const rDep = await processPunch(sb, A, punch("departure", "2026-06-25T06:00:00+09:00", { vehicle_no: "1001" }));
  check("出発で勤務が開く", !!rDep.shiftId && !rDep.close, rDep);
  const shiftId = rDep.shiftId;

  // 休憩開始（アルコール不要で通る）
  const rS = await processPunch(sb, A, punch("rest_start", "2026-06-25T10:00:00+09:00"));
  check("休憩開始は同じ勤務に紐づく", rS.shiftId === shiftId, { rS: rS.shiftId, shiftId });
  check("休憩開始で勤務はクローズしない", !rS.close);

  // 休憩終了
  const rE = await processPunch(sb, A, punch("rest_end", "2026-06-25T10:30:00+09:00"));
  check("休憩終了も同じ勤務に紐づく", rE.shiftId === shiftId, { rE: rE.shiftId, shiftId });
  check("休憩終了で勤務はクローズしない", !rE.close);

  // events に保存されている（＝ CHECK制約 0013 が新種別を受理＝本番migration適用の検証）
  const { data: evs, error: evErr } = await sb
    .from("events")
    .select("event_type")
    .eq("driver_id", A)
    .in("event_type", ["rest_start", "rest_end"]);
  check("rest_start/rest_end が events に保存される（0013適用済）", !evErr && (evs?.length ?? 0) === 2, evErr ?? evs);

  // 退勤で勤務クローズ・拘束は span（06:00-18:00=720分）
  const rOut = await processPunch(sb, A, punch("clock_out", "2026-06-25T18:00:00+09:00"));
  check("退勤で勤務がクローズ", !!rOut.close, rOut);
  check("拘束=720分(12h・休憩打刻は span に影響しない)", rOut.close?.metrics.restraintMin === 720, rOut.close?.metrics);

  console.log("\n[検証] 冪等性（休憩開始の再送）");
  const idem = randomUUID();
  await processPunch(sb, A, punch("departure", "2026-06-26T06:00:00+09:00"));
  const g1 = await processPunch(sb, A, { idempotency_key: idem, event_type: "rest_start", occurred_at: "2026-06-26T09:00:00+09:00" });
  const g2 = await processPunch(sb, A, { idempotency_key: idem, event_type: "rest_start", occurred_at: "2026-06-26T09:00:00+09:00" });
  check("再送で同一eventId・deduped", g1.eventId === g2.eventId && g2.deduped === true, { g1: g1.eventId, g2: g2.eventId });
}

async function cleanup() {
  for (const id of createdDriverIds) {
    await sb.from("events").delete().eq("driver_id", id);
    await sb.from("compliance_alerts").delete().eq("driver_id", id);
    await sb.from("shifts").delete().eq("driver_id", id);
    await sb.from("drivers").delete().eq("id", id);
  }
}

main()
  .catch((e) => {
    fail++;
    console.error("実行エラー:", e);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
