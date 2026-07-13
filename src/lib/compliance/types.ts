/**
 * 改善基準告示 判定の型定義（仕様書 6章 / 13章B）。
 * すべて分(min)単位。閾値は app_settings('compliance') から構成管理。
 */

export interface ComplianceConfig {
  version: string;
  timezone: string;
  night: { start: string; end: string };
  daily_restraint: {
    principle_min: number;
    max_min: number;
    extended_threshold_min: number;
    extended_count_per_week: number;
  };
  monthly_restraint: { principle_min: number; agreement_max_min: number };
  yearly_restraint: { principle_min: number; agreement_max_min: number };
  rest_period: { principle_min: number; min_floor_min: number };
  driving_time: {
    two_day_avg_daily_max_min: number;
    two_week_avg_weekly_max_min: number;
  };
  continuous_driving: {
    max_min: number;
    break_unit_min: number;
    break_total_min: number;
  };
  /**
   * 改善基準告示の特例（該当する働き方の勤務にのみ適用 / 要社労士確認）。
   *  - two_person: 2人乗務。拘束を延長・休息を短縮できる。
   *  - split_rest: 分割休息。休息期間を分割する場合の下限（合計/1回）。
   *  - ferry    : フェリー乗船時間を休息期間として扱う（拘束から控除）。
   * 既定は公知の2024年告示値。実際の判定反映前に社労士確認のこと。
   */
  special_cases: {
    two_person: { max_restraint_min: number; min_rest_period_min: number };
    split_rest: { min_segment_min: number; min_total_min: number; max_splits: number };
    ferry: { credit_cap_min: number }; // 休息として控除できる上限（0=上限なし）
  };
}

/**
 * 勤務単位の作業区分（特例の適用フラグ）。無指定＝通常勤務（標準ルール）。
 * shifts.crew_type / ferry_min / split_rest から構成し judgeShift へ渡す。
 */
export interface ShiftWorkMode {
  crewType?: "single" | "double"; // 2人乗務
  ferryMin?: number; // フェリー乗船分（休息として拘束から控除）
  splitRest?: boolean; // 分割休息を適用
}

/** 1勤務分の基礎指標（仕様書 6.1） */
export interface ShiftMetrics {
  restraintMin: number | null; // 拘束時間
  laborMin: number | null; // 労働時間 = 拘束 − 休憩
  nightMin: number; // 深夜労働
  restPeriodMin: number | null; // 休息期間 = 当勤務出勤 − 前勤務退勤
}

export type AlertSeverity = "violation" | "warning" | "info";

export interface ComplianceAlertItem {
  type: string; // restraint / rest_period / night / continuous_drive ...
  severity: AlertSeverity;
  message: string;
  actualMin?: number;
  thresholdMin?: number;
}

export interface ShiftJudgement {
  alertTypes: string[]; // 違反/警告の type 一覧（compliance_alerts.alert_types）
  items: ComplianceAlertItem[]; // 詳細（compliance_alerts.detail へ）
  hasViolation: boolean;
}
