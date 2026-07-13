/**
 * 改善基準告示の特例（2人乗務 / フェリー / 分割休息）判定 ユニットテスト（純関数・DB不要）。
 * 実行: npm run test:compliance-special
 */
import { judgeShift } from "@/lib/compliance/calculate";
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

console.log("\n[分割休息(splitRest): 休息下限を合計10hへ]");
check("休息10.5h(630)は分割休息で警告なし", !hasWarn(judge(m({ restPeriodMin: 630 }), { splitRest: true }), "rest_period"));
check("同じ10.5hでも標準は基本未満で警告", hasWarn(judge(m({ restPeriodMin: 630 })), "rest_period"));
check("休息9.5h(570)は分割休息では違反(合計10h未満)", hasViol(judge(m({ restPeriodMin: 570 }), { splitRest: true }), "rest_period"));

console.log("\n[特例適用の情報記録]");
check("特例適用時 special_case(info) が付く", judge(m({ restraintMin: 600 }), { crewType: "double" }).items.some((i) => i.type === "special_case" && i.severity === "info"));
check("標準勤務では special_case は付かない", !judge(m({ restraintMin: 600 })).items.some((i) => i.type === "special_case"));

console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
