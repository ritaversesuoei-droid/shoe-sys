import { jstMinuteOfDay, parseTimeToMinutes, diffMinutes } from "@/lib/time";
import type {
  ComplianceConfig,
  ShiftMetrics,
  ShiftJudgement,
  ComplianceAlertItem,
  ShiftWorkMode,
} from "./types";

const MS_PER_MIN = 60_000;
const MIN_PER_DAY = 1440;
const MAX_SPAN_MIN = 14 * MIN_PER_DAY; // 安全上限（長距離=複数日を考慮）

/**
 * 区間 [startIso, endIso) のうち深夜帯(既定22:00-05:00, JST)に該当する分数。
 * 仕様書 6.1「深夜労働: 出退勤のうち22:00-05:00に該当する分（1分刻み）」。
 */
export function calcNightMinutes(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  config: ComplianceConfig,
): number {
  if (!startIso || !endIso) return 0;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 0;

  const nightStart = parseTimeToMinutes(config.night.start) ?? 1320; // 22:00
  const nightEnd = parseTimeToMinutes(config.night.end) ?? 300; // 05:00
  const wraps = nightStart >= nightEnd; // 深夜帯が日跨ぎか
  const inNight = (mod: number) =>
    wraps ? mod >= nightStart || mod < nightEnd : mod >= nightStart && mod < nightEnd;

  const startMin = Math.floor(startMs / MS_PER_MIN);
  const endMin = Math.ceil(endMs / MS_PER_MIN);
  const span = Math.min(endMin - startMin, MAX_SPAN_MIN);

  let count = 0;
  for (let i = 0; i < span; i++) {
    const mod = jstMinuteOfDay((startMin + i) * MS_PER_MIN);
    if (inNight(mod)) count++;
  }
  return count;
}

export interface ShiftMetricsInput {
  clockInAt: string | null;
  clockOutAt: string | null;
  restMin: number; // 休憩時間（分）
  prevClockOutAt?: string | null; // 直前勤務の退勤（休息期間算定用）
}

/** 1勤務の基礎指標を算出（仕様書 6.1）。 */
export function calcShiftMetrics(
  input: ShiftMetricsInput,
  config: ComplianceConfig,
): ShiftMetrics {
  const restraintMin = diffMinutes(input.clockInAt, input.clockOutAt);
  const laborMin =
    restraintMin == null ? null : Math.max(0, restraintMin - input.restMin);
  const nightMin = calcNightMinutes(input.clockInAt, input.clockOutAt, config);
  const restPeriodMin = diffMinutes(input.prevClockOutAt, input.clockInAt);
  return { restraintMin, laborMin, nightMin, restPeriodMin };
}

export interface JudgeContext {
  /** 当該週で既に「14h超(extended_threshold)」となった回数（週2回まで目安の判定用） */
  extendedCountThisWeek?: number;
}

/**
 * 1勤務の改善基準告示 違反/警告判定（仕様書 6.2 / 13章B 最新法令準拠）。
 * 月次・年次・運転時間（2日/2週平均）・連続運転は集計レイヤ（F-14）で別途判定する。
 *
 * workMode（該当勤務のみ）で改善基準告示の特例を適用（要社労士確認）:
 *   - 2人乗務(crewType='double'): 拘束上限を延長・休息下限を短縮（14h週2回ラダーは不適用）
 *   - フェリー(ferryMin): 乗船時間を休息扱いとして拘束から控除
 *   - 分割休息(splitRest): 休息期間の下限を分割休息の合計下限へ緩和
 * workMode 未指定なら標準ルール（従来と同一挙動）。
 */
export function judgeShift(
  metrics: ShiftMetrics,
  config: ComplianceConfig,
  ctx: JudgeContext = {},
  workMode: ShiftWorkMode = {},
): ShiftJudgement {
  const items: ComplianceAlertItem[] = [];
  const { restraintMin, restPeriodMin, nightMin } = metrics;
  const dr = config.daily_restraint;
  const rp = config.rest_period;
  const sc = config.special_cases;

  const isDouble = workMode.crewType === "double";
  const splitRest = workMode.splitRest === true;
  // フェリー乗船時間は休息期間として拘束から控除（cap>0なら上限あり）。
  const ferryRaw = Math.max(0, Math.round(workMode.ferryMin ?? 0));
  const ferryCredit = sc.ferry.credit_cap_min > 0 ? Math.min(ferryRaw, sc.ferry.credit_cap_min) : ferryRaw;

  const appliedNotes: string[] = [];
  if (isDouble) appliedNotes.push("2人乗務");
  if (ferryCredit > 0) appliedNotes.push(`フェリー控除 ${hhmm(ferryCredit)}`);
  if (splitRest) appliedNotes.push("分割休息");

  // --- 1日の拘束時間（フェリー控除後で判定） ---
  const effRestraint = restraintMin == null ? null : Math.max(0, restraintMin - ferryCredit);
  const maxRestraint = isDouble ? sc.two_person.max_restraint_min : dr.max_min;
  if (effRestraint != null) {
    if (effRestraint > maxRestraint) {
      items.push({
        type: "restraint",
        severity: "violation",
        message: `拘束時間が上限(${hhmm(maxRestraint)})を超過${isDouble ? "（2人乗務特例）" : ""}`,
        actualMin: effRestraint,
        thresholdMin: maxRestraint,
      });
    } else if (!isDouble && effRestraint > dr.extended_threshold_min) {
      // 14h超の「週2回まで」ラダーは単独乗務のみ（2人乗務は上限までOK）
      const over = (ctx.extendedCountThisWeek ?? 0) >= dr.extended_count_per_week;
      items.push({
        type: "restraint",
        severity: over ? "violation" : "warning",
        message: over
          ? `拘束${hhmm(dr.extended_threshold_min)}超が週${dr.extended_count_per_week}回の上限を超過`
          : `拘束時間が原則(${hhmm(dr.principle_min)})を超過（週${dr.extended_count_per_week}回まで許容）`,
        actualMin: effRestraint,
        thresholdMin: dr.extended_threshold_min,
      });
    }
  }

  // --- 休息期間（特例で下限を切替） ---
  const restFloor = isDouble
    ? sc.two_person.min_rest_period_min
    : splitRest
      ? sc.split_rest.min_total_min
      : rp.min_floor_min;
  if (restPeriodMin != null) {
    if (restPeriodMin < restFloor) {
      items.push({
        type: "rest_period",
        severity: "violation",
        message: `休息期間が下限(${hhmm(restFloor)})未満${isDouble ? "（2人乗務特例）" : splitRest ? "（分割休息特例）" : ""}`,
        actualMin: restPeriodMin,
        thresholdMin: restFloor,
      });
    } else if (!isDouble && !splitRest && restPeriodMin < rp.principle_min) {
      // 基本(11h)未満の注意喚起は標準ルールのみ（特例適用時は下限のみ判定）
      items.push({
        type: "rest_period",
        severity: "warning",
        message: `休息期間が基本(${hhmm(rp.principle_min)})未満`,
        actualMin: restPeriodMin,
        thresholdMin: rp.principle_min,
      });
    }
  }

  // --- 適用した特例を情報として明示（監査証跡・要社労士確認） ---
  if (appliedNotes.length > 0) {
    items.push({
      type: "special_case",
      severity: "info",
      message: `特例適用: ${appliedNotes.join(" / ")}（要社労士確認）`,
    });
  }

  // --- 深夜労働（情報: 割増対象） ---
  if (nightMin > 0) {
    items.push({
      type: "night",
      severity: "info",
      message: `深夜労働 ${hhmm(nightMin)}`,
      actualMin: nightMin,
    });
  }

  const flagged = items.filter((i) => i.severity !== "info");
  return {
    items,
    alertTypes: Array.from(new Set(flagged.map((i) => i.type))),
    hasViolation: items.some((i) => i.severity === "violation"),
  };
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
