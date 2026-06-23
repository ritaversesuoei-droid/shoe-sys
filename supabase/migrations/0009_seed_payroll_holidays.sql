-- ============================================================
-- 0009: 給与/所定 設定 と 休日区分の手修正ストア（F-14 月次）
-- ============================================================
-- 所定労働時間（残業算定の基準）と、休日区分の手修正(overrides)を app_settings に保持。
-- holiday_overrides は { 'yyyy-MM-dd': 'holiday' | 'workday' } の手修正のみ（祝日本体は算出: src/lib/holidays.ts）。

insert into public.app_settings (key, value, description) values
  ('payroll',
   '{"regular_daily_min": 480}'::jsonb,
   '給与/所定 設定。regular_daily_min=1日の所定労働(分, 残業算定の基準)'),
  ('holiday_overrides',
   '{}'::jsonb,
   '休日区分の手修正。日付→holiday/workday。祝日本体は holidays.ts で算出し、これは上書きのみ')
on conflict (key) do nothing;
