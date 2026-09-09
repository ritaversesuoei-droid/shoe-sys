/**
 * 改善基準告示の特例（2人乗務 / フェリー / 分割休息）判定 ユニットテスト（純関数・DB不要）。
 * 実行: npm run test:compliance-special
 */
import { judgeShift, calcShiftMetrics, maxContinuousDriveMin } from "@/lib/compliance/calculate";
import { DEFAULT_COMPLIANCE_CONFIG as CFG } from "@/lib/compliance/config";
import type { ShiftMetrics, ShiftWorkMode } from "@/lib/compliance/types";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail ?? ""); }
}

function m(partial: Partial<ShiftMetrics>): ShiftMetrics {
  return { restraintMin: null, laborMin: null, nightMin: 0, restPeriodMin: null, ...partial };
}
function judge(metrics: ShiftMetrics, mode?: ShiftWorkMode) {
  return judgeShift(metrics, CFG, {}, mode);
}
const hasViol = (r: ReturnType<typeof judge>, type: string) =>
  r.items.some((i) => i.type === type && i.severity === "violation");
const hasWarn = (r: ReturnType<typeof judge>, type: string) =>
  r.items.some((i) => i.type === type && i.severity === "warning");

console.log("\n[標準ルール（後方互換）]");
check("拘束20h=標準は違反", hasViol(judge(m({ restraintMin: 1200 })), "restraint"));
check("拘束13h=標準は違反なし", !hasViol(judge(m({ restraintMin: 780 })), "restraint"));
check("workMode未指定と空{}は同一", JSON.stringify(judgeShift(m({ restraintMin: 1200 }), CFG, {}))
  === JSON.stringify(judgeShift(m({ restraintMin: 1200 }), CFG, {}, {})));

console.log("\n[2人乗務(crewType=double): 拘束20h/休息4h]");
check("拘束20h(1200)は違反なし", !hasViol(judge(m({ restraintMin: 1200 }), { crewType: "double" }), "restraint"));
check("拘束20h1分(1201)は違反", hasViol(judge(m({ restraintMin: 1201 }), { crewType: "double" }), "restraint"));
check("拘束16h(960)で14h超ラダー警告は出ない", !hasWarn(judge(m({ restraintMin: 960 }), { crewType: "double" }), "restraint"));
check("休息4h(240)は違反なし", !hasViol(judge(m({ restPeriodMin: 240 }), { crewType: "double" }), "rest_period"));
check("休息3h59分(239)は違反", hasViol(judge(m({ restPeriodMin: 239 }), { crewType: "double" }), "rest_period"));

console.log("\n[フェリー乗船(ferryMin): 乗船時間を拘束から控除]");
check("拘束18h・フェリー6h控除→実質12h=違反なし", !hasViol(judge(m({ restraintMin: 1080 }), { ferryMin: 360 }), "restraint"));
check("同じ拘束18hでもフェリー無しなら違反", hasViol(judge(m({ restraintMin: 1080 })), "restraint"));

console.log("\n[分割休息(splitRest): 1回の下限を3h(min_segment)で判定]");
check("休息10.5h(630)は分割休息で警告なし", !hasWarn(judge(m({ restPeriodMin: 630 }), { splitRest: true }), "rest_period"));
check("同じ10.5hでも標準は基本未満で警告", hasWarn(judge(m({ restPeriodMin: 630 })), "rest_period"));
check("分割休息: 1回3h(180)は下限OK・違反なし", !hasViol(judge(m({ restPeriodMin: 180 }), { splitRest: true }), "rest_period"));
check("分割休息: 1回2h59分(179)は下限未満で違反", hasViol(judge(m({ restPeriodMin: 179 }), { splitRest: true }), "rest_period"));
check("旧不具合の非再現: 9.5h(570)は分割休息では違反にならない", !hasViol(judge(m({ restPeriodMin: 570 }), { splitRest: true }), "rest_period"));

console.log("\n[特例適用の情報記録]");
check("特例適用時 special_case(info) が付く", judge(m({ restraintMin: 600 }), { crewType: "double" }).items.some((i) => i.type === "special_case" && i.severity === "info"));
check("標準勤務では special_case は付かない", !judge(m({ restraintMin: 600 })).items.some((i) => i.type === "special_case"));

console.log("\n[労基法34条の休憩不足(④): 労働6h超→45分/8h超→60分]");
check("労働9h・休憩45分(要60)は警告", hasWarn(judge(m({ restraintMin: 585, laborMin: 540 })), "break"));
check("労働9h・休憩60分(要60)は警告なし", !hasWarn(judge(m({ restraintMin: 600, laborMin: 540 })), "break"));
check("労働7h・休憩0分(要45)は警告", hasWarn(judge(m({ restraintMin: 420, laborMin: 420 })), "break"));
check("労働5h・休憩0分(要なし)は警告なし", !hasWarn(judge(m({ restraintMin: 300, laborMin: 300 })), "break"));

console.log("\n[② 深夜(22-5)の休憩を深夜労働から控除]");
const nInISO = "2026-09-09T20:00:00+09:00";
const nOutISO = "2026-09-10T06:00:00+09:00"; // 深夜22-5=420分
const noBreak = calcShiftMetrics({ clockInAt: nInISO, clockOutAt: nOutISO, restMin: 40 }, CFG);
const withBreak = calcShiftMetrics(
  { clockInAt: nInISO, clockOutAt: nOutISO, restMin: 40, breaks: [{ startIso: "2026-09-09T23:00:00+09:00", endIso: "2026-09-09T23:40:00+09:00" }] },
  CFG,
);
check("休憩区間なしは深夜控除しない（従来どおり）", noBreak.nightMin === 420, noBreak.nightMin);
check("深夜の休憩40分が深夜労働から控除される", withBreak.nightMin === 380, withBreak.nightMin);
const dayBreak = calcShiftMetrics(
  { clockInAt: nInISO, clockOutAt: nOutISO, restMin: 30, breaks: [{ startIso: "2026-09-09T20:30:00+09:00", endIso: "2026-09-09T21:00:00+09:00" }] },
  CFG,
);
check("深夜帯外(20:30-21:00)の休憩は深夜労働を減らさない", dayBreak.nightMin === 420, dayBreak.nightMin);

console.log("\n[① 430 連続運転(4h/30分中断): 休憩ボタン運用時のみ判定]");
const D = "2026-09-09";
const cd1 = maxContinuousDriveMin(`${D}T08:00:00+09:00`, `${D}T18:00:00+09:00`, [{ startIso: `${D}T12:00:00+09:00`, endIso: `${D}T12:40:00+09:00` }], CFG);
check("30分休憩1回→後半が最長320分", cd1 === 320, cd1);
const cd2 = maxContinuousDriveMin(`${D}T08:00:00+09:00`, `${D}T18:00:00+09:00`, [{ startIso: `${D}T11:30:00+09:00`, endIso: `${D}T12:10:00+09:00` }, { startIso: `${D}T15:00:00+09:00`, endIso: `${D}T15:40:00+09:00` }], CFG);
check("4h以内ごとに30分休憩→最長210分", cd2 === 210, cd2);
const cd3 = maxContinuousDriveMin(`${D}T08:00:00+09:00`, `${D}T13:00:00+09:00`, [], CFG);
check("休憩なし5hは300分", cd3 === 300, cd3);
check("continuousDriveMin=300で430警告", hasWarn(judgeShift(m({ restraintMin: 300 }), CFG, { continuousDriveMin: 300 }), "continuous_drive"));
check("continuousDriveMin=240ちょうどは警告なし", !hasWarn(judgeShift(m({ restraintMin: 300 }), CFG, { continuousDriveMin: 240 }), "continuous_drive"));
check("continuousDriveMin未指定(手入力)は430判定しない", !judgeShift(m({ restraintMin: 900 }), CFG, {}).items.some((i) => i.type === "continuous_drive"));

console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
