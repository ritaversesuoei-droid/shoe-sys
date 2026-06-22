/**
 * 是正フロー 実DB結合テスト（仕様書 F-13 / 13章D ソフト解消）。実行: npm run test:warning
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

async function main() {
  const s = Date.now();
  const { data: d } = await sb.from("drivers").insert({ code: `WN${s % 100000}`, name: `TEST_WARN_${s}` }).select("id").single();
  const A = d!.id;
  drivers.push(A);

  // 18h勤務 → 拘束超過の違反
  await processPunch(sb, A, punch("departure", "2026-06-20T06:00:00+09:00", { vehicle_no: "1001" }));
  await processPunch(sb, A, punch("clock_out", "2026-06-21T00:00:00+09:00", { vehicle_no: "1001" }));

  const { data: open } = await sb.from("compliance_alerts").select("id, status").eq("driver_id", A).eq("status", "open");
  check("未対応の違反が1件作られる", (open?.length ?? 0) === 1, open);
  const alertId = open?.[0]?.id;

  // 是正登録（ルートと同等の更新: ソフト解消）
  const { error: upErr } = await sb
    .from("compliance_alerts")
    .update({
      correction_reason: "長時間運行の是正指導済み",
      correction_note: "翌週の配車を調整",
      status: "resolved",
      corrected_at: new Date().toISOString(),
    })
    .eq("id", alertId!);
  check("是正更新が成功", !upErr, upErr?.message);

  // 解消後も行は残る（監査証跡）
  const { data: after } = await sb.from("compliance_alerts").select("status, correction_reason").eq("id", alertId!).maybeSingle();
  check("ステータスがresolved", after?.status === "resolved", after?.status);
  check("是正理由が保存される", after?.correction_reason === "長時間運行の是正指導済み", after?.correction_reason);
  check("行は物理削除されず残る（監査証跡）", !!after);

  const { data: stillOpen } = await sb.from("compliance_alerts").select("id").eq("driver_id", A).eq("status", "open");
  check("未対応一覧から消える", (stillOpen?.length ?? 0) === 0, stillOpen);
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
