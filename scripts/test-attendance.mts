/**
 * 勤怠修正（修正入力 / F-19）結合テスト。実行: npm run test:attendance
 *   applyShiftEdit: 修正出退勤・補正・休憩・理由 → 確定時刻再構成 → 拘束/労働/深夜の再計算。
 *   server モジュール参照のため --conditions=react-server で実行。
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyShiftEdit } from "@/lib/operations/shift";
import { AppError } from "@/lib/errors";

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}
async function metrics(id: string) {
  const { data } = await sb.from("shifts").select("clock_out_at,restraint_min,labor_min,night_min,revision_status,revision_reason,rest_time").eq("id", id).single();
  return data!;
}

const ids: string[] = [];
async function main() {
  const { data: drv } = await sb.from("drivers").insert({ code: "AT" + (Date.now() % 100000), name: "勤怠修正_試験" }).select("id").single();
  ids.push(drv!.id);

  // 初期勤務: 6/15(月? いや日曜判定は別) 06:00→18:00, 休憩0 → 拘束720
  const { data: sh } = await sb.from("shifts").insert({
    driver_id: drv!.id, work_date: "2026-06-15", month_key: "202606",
    clock_in_at: "2026-06-15T06:00:00+09:00", clock_out_at: "2026-06-15T18:00:00+09:00",
    actual_in: "06:00:00", actual_out: "18:00:00", rest_time: "0",
  }).select("id").single();
  const id = sh!.id;

  console.log("\n[1] 退勤を20:00へ修正 → 拘束14h(840)");
  await applyShiftEdit(sb, id, { editedIn: "06:00", editedOut: "20:00", reason: "残業対応" });
  let m = await metrics(id);
  check("拘束=840分", m.restraint_min === 840, m.restraint_min);
  check("確定退勤が20:00", (m.clock_out_at ?? "").includes("T11:00:00"), m.clock_out_at); // 20:00 JST = 11:00Z
  check("状態=edited / 理由保存", m.revision_status === "edited" && m.revision_reason === "残業対応", m);

  console.log("\n[2] 休憩120分 → 労働=拘束−休憩");
  await applyShiftEdit(sb, id, { restMin: 120 });
  m = await metrics(id);
  check("休憩120分が反映", /^0?2:00/.test(m.rest_time), m.rest_time);
  check("労働=840−120=720", m.labor_min === 720, m.labor_min);

  console.log("\n[3] 退勤補正+1日 02:00 → 翌日跨ぎ 拘束20h(1200)");
  await applyShiftEdit(sb, id, { editedOut: "02:00", outAdjDays: 1, restMin: 0 });
  m = await metrics(id);
  check("確定退勤が翌日(6/16)", (m.clock_out_at ?? "").includes("2026-06-15T17:00:00"), m.clock_out_at); // 6/16 02:00 JST = 6/15 17:00Z
  check("拘束=1200分(20h)", m.restraint_min === 1200, m.restraint_min);

  console.log("\n[4] 存在しないIDは404");
  let threw = false;
  try { await applyShiftEdit(sb, "00000000-0000-0000-0000-000000000000", { editedIn: "06:00" }); }
  catch (e) { threw = e instanceof AppError && e.status === 404; }
  check("AppError(404)", threw);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    for (const i of ids) { await sb.from("compliance_alerts").delete().eq("driver_id", i); await sb.from("shifts").delete().eq("driver_id", i); await sb.from("drivers").delete().eq("id", i); }
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
