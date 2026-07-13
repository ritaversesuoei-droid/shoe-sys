import type { ComplianceConfig } from "./types";

/**
 * フォールバック既定値（app_settings 未投入時の保険）。
 * 正本は DB の app_settings('compliance')（supabase/migrations/0007）。
 * !! 法令最新値は要検証（仕様書 12章）。
 */
export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  version: "2024-04",
  timezone: "Asia/Tokyo",
  night: { start: "22:00", end: "05:00" },
  daily_restraint: {
    principle_min: 780,
    max_min: 900,
    extended_threshold_min: 840,
    extended_count_per_week: 2,
  },
  monthly_restraint: { principle_min: 17040, agreement_max_min: 18600 },
  yearly_restraint: { principle_min: 198000, agreement_max_min: 204000 },
  rest_period: { principle_min: 660, min_floor_min: 540 },
  driving_time: {
    two_day_avg_daily_max_min: 540,
    two_week_avg_weekly_max_min: 2640,
  },
  continuous_driving: { max_min: 240, break_unit_min: 10, break_total_min: 30 },
  // 公知の2024年告示値（要社労士確認）。該当勤務のみ適用。
  special_cases: {
    two_person: { max_restraint_min: 1200, min_rest_period_min: 240 }, // 拘束20h / 休息4h
    split_rest: { min_segment_min: 180, min_total_min: 600, max_splits: 3 }, // 1回3h以上 / 合計10h以上
    ferry: { credit_cap_min: 0 }, // 0=控除上限なし
  },
};

/** 任意の JSON 値を ComplianceConfig へマージ（欠損キーは既定値で補完）。 */
export function mergeComplianceConfig(value: unknown): ComplianceConfig {
  const v = (value ?? {}) as Partial<ComplianceConfig>;
  const d = DEFAULT_COMPLIANCE_CONFIG;
  return {
    version: v.version ?? d.version,
    timezone: v.timezone ?? d.timezone,
    night: { ...d.night, ...v.night },
    daily_restraint: { ...d.daily_restraint, ...v.daily_restraint },
    monthly_restraint: { ...d.monthly_restraint, ...v.monthly_restraint },
    yearly_restraint: { ...d.yearly_restraint, ...v.yearly_restraint },
    rest_period: { ...d.rest_period, ...v.rest_period },
    driving_time: { ...d.driving_time, ...v.driving_time },
    continuous_driving: { ...d.continuous_driving, ...v.continuous_driving },
    special_cases: {
      two_person: { ...d.special_cases.two_person, ...v.special_cases?.two_person },
      split_rest: { ...d.special_cases.split_rest, ...v.special_cases?.split_rest },
      ferry: { ...d.special_cases.ferry, ...v.special_cases?.ferry },
    },
  };
}
