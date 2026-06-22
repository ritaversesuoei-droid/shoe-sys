-- ============================================================
-- 0007: 改善基準告示 判定パラメータ 初期値（構成管理）
-- ============================================================
-- 仕様書 6章 / 13章B(=最新法令準拠で再設計) / 12.2-#5。
--
-- !! 重要 !! 以下は 2024年4月施行「自動車運転者の労働時間等の改善のための基準」(トラック)
--           を実装の出発点として設定した既定値です。実運用前に必ず最新の法令条文・
--           労使協定・社労士確認で数値を検証してください（仕様書 12章: 法令の最新値との突合は別途必要）。
-- すべて分(min)単位。app_settings.value(jsonb) で構成管理し、コード変更なしで調整可能。

insert into public.app_settings (key, value, description)
values (
  'compliance',
  jsonb_build_object(
    'version', '2024-04',
    'timezone', 'Asia/Tokyo',
    -- 深夜帯（仕様書 6.3）
    'night', jsonb_build_object('start', '22:00', 'end', '05:00'),
    -- 1日の拘束時間: 原則13h(780) / 上限15h(900) / 14h(840)超は週2回まで目安
    'daily_restraint', jsonb_build_object(
      'principle_min', 780,
      'max_min', 900,
      'extended_threshold_min', 840,
      'extended_count_per_week', 2
    ),
    -- 1ヶ月の拘束時間: 原則284h(17040) / 労使協定 最大310h(18600)
    'monthly_restraint', jsonb_build_object(
      'principle_min', 17040,
      'agreement_max_min', 18600
    ),
    -- 1年の拘束時間: 原則3300h(198000) / 労使協定 最大3400h(204000)
    'yearly_restraint', jsonb_build_object(
      'principle_min', 198000,
      'agreement_max_min', 204000
    ),
    -- 休息期間: 継続11h(660)基本 / 下限9h(540)
    'rest_period', jsonb_build_object(
      'principle_min', 660,
      'min_floor_min', 540
    ),
    -- 運転時間: 2日平均1日9h(540) / 2週平均1週44h(2640)
    'driving_time', jsonb_build_object(
      'two_day_avg_daily_max_min', 540,
      'two_week_avg_weekly_max_min', 2640
    ),
    -- 連続運転: 4h(240)以内 / 中断1回おおむね10分以上・合計30分以上
    'continuous_driving', jsonb_build_object(
      'max_min', 240,
      'break_unit_min', 10,
      'break_total_min', 30
    )
  ),
  '改善基準告示(2024-04)判定パラメータ。法令最新値の検証必須（仕様書6章/13章B）'
)
on conflict (key) do nothing;

-- LINE 当月使用量の上限目安（F-20 / 12.2-#6）。実プランに合わせて調整。
insert into public.app_settings (key, value, description)
values (
  'line',
  jsonb_build_object('monthly_limit', 200),
  'LINE通知 月上限の目安（F-20）'
)
on conflict (key) do nothing;
