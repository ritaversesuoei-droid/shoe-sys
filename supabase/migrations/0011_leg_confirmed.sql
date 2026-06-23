-- ============================================================
-- 0011: 運行ルートの ○確認（仕様書 4.6 保存時バリデーション）
-- ============================================================
-- 日報の各明細(leg)をドライバーが確認したか。確定時は全legの確認を必須化。

alter table public.daily_report_legs
  add column if not exists confirmed boolean not null default false;

comment on column public.daily_report_legs.confirmed is '運行ルート確認（○）。確定時は全legの確認が必須（4.6）';
