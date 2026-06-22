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
