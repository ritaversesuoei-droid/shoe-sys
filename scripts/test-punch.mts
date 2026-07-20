/**
 * 打刻パイプライン 実DB結合テスト（仕様書 4.3）。
 * 実行: npm run test:punch
 *   - service_role クライアントで RLS をバイパスし、テスト用ドライバーで一連の打刻を流す。
 *   - 勤務連結・集計・改善基準告示判定・二重打刻防止を検証。
 *   - 終了時にテストデータを必ず削除（finally）。
 * 注意: 実DBに一時データを作成します（クリーンアップ済）。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import { processPunch, type PunchInput } from "@/lib/operations/punch";
import { PunchError } from "@/lib/errors";

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

async function expectThrows(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "（例外が発生しませんでした）");
  } catch (e) {
    check(label, e instanceof PunchError, e instanceof Error ? e.message : e);
  }
}

const createdDriverIds: string[] = [];
async function makeDriver(code: string, name: string): Promise<string> {
  const { data, error } = await sb
    .from("drivers")
    .insert({ code, name })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("driver作成失敗");
  createdDriverIds.push(data.id);
  return data.id;
}

async function main() {
  const stamp = Date.now();
  const A = await makeDriver(`TA${stamp % 100000}`, `TEST_PUNCH_A_${stamp}`);
  const B = await makeDriver(`TB${stamp % 100000}`, `TEST_PUNCH_B_${stamp}`);

  console.log("\n[シナリオ1] 通常運行: 出発→積込→退勤（拘束15h=警告）");
  const r1 = await processPunch(sb, A, punch("departure", "2026-06-20T06:00:00+09:00", { vehicle_no: "1001" }));
  check("出発で勤務が新規作成される", !!r1.shiftId && !r1.close);
  await processPunch(sb, A, punch("loading", "2026-06-20T10:00:00+09:00", {
    items: [{ shipper: "荷主X", delivery_spot: "東京都江東区", quantity: "10", weight: "2t", slip_no: "S-1" }],
  }));
  const r1c = await processPunch(sb, A, punch("clock_out", "2026-06-20T21:00:00+09:00"));
  check("退勤で拘束=900分(15h)", r1c.close?.metrics.restraintMin === 900, r1c.close?.metrics);
  check("深夜=0分", r1c.close?.metrics.nightMin === 0);
  check("拘束>14hで警告(restraint)が立つ", r1c.close?.judgement.alertTypes.includes("restraint") === true, r1c.close?.judgement.alertTypes);

  console.log("\n[シナリオ2] 連続運行: 休息期間4h<9h=違反 + 深夜労働");
  await processPunch(sb, A, punch("departure", "2026-06-21T01:00:00+09:00"));
  const r2c = await processPunch(sb, A, punch("clock_out", "2026-06-21T05:00:00+09:00"));
  check("拘束=240分(4h)", r2c.close?.metrics.restraintMin === 240, r2c.close?.metrics);
  check("休息期間=240分(4h)", r2c.close?.metrics.restPeriodMin === 240, r2c.close?.metrics.restPeriodMin);
  check("深夜=240分(01-05時)", r2c.close?.metrics.nightMin === 240, r2c.close?.metrics.nightMin);
  check("休息不足で違反(rest_period)", r2c.close?.judgement.alertTypes.includes("rest_period") === true, r2c.close?.judgement.alertTypes);
  check("hasViolation=true", r2c.close?.judgement.hasViolation === true);

  console.log("\n[検証] compliance_alerts への記録");
  const { data: alerts } = await sb
    .from("compliance_alerts")
    .select("alert_types, status")
    .eq("driver_id", A);
  check("Aの違反台帳が2件以上記録", (alerts?.length ?? 0) >= 2, alerts);

  console.log("\n[シナリオ3] 二重打刻防止・アルコール必須");
  await expectThrows("退勤(開勤務なし)はPunchError", () =>
    processPunch(sb, B, punch("clock_out", "2026-06-22T09:00:00+09:00")),
  );
  await expectThrows("長距離再出発(アルコール無)はPunchError", () =>
    processPunch(sb, B, punch("leg_departure", "2026-06-22T09:00:00+09:00")),
  );
  await processPunch(sb, B, punch("departure", "2026-06-22T08:00:00+09:00"));
  await expectThrows("出発の二重打刻はPunchError", () =>
    processPunch(sb, B, punch("departure", "2026-06-22T09:00:00+09:00")),
  );

  console.log("\n[検証] 冪等性（同一idempotency_key）");
  const idem = randomUUID();
  const f1 = await processPunch(sb, B, { idempotency_key: idem, event_type: "arrival", occurred_at: "2026-06-22T10:00:00+09:00" });
  const f2 = await processPunch(sb, B, { idempotency_key: idem, event_type: "arrival", occurred_at: "2026-06-22T10:00:00+09:00" });
  check("再送で同一eventId・deduped", f1.eventId === f2.eventId && f2.deduped === true, { f1: f1.eventId, f2: f2.eventId });
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
