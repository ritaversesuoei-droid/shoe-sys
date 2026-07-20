-- 0016_review_and_affiliation.sql
-- ③(1) 勤怠修正の「確認済みフォルダ」用フラグ / ① 自社・協力店社の区別。追加のみ・非破壊。
--   shifts.confirmed        : 勤怠修正で「確認済み」にした勤務（未確認/確認済みフォルダで振分け）
--   drivers.manage_attendance: 勤怠管理の対象か（true=自社 / false=協力店社=打刻履歴のみ・違反判定なし）

alter table public.shifts
  add column if not exists confirmed boolean not null default false;

alter table public.drivers
  add column if not exists manage_attendance boolean not null default true;

comment on column public.shifts.confirmed is '勤怠修正で確認済みにした勤務（③(1) 確認済みフォルダ）';
comment on column public.drivers.manage_attendance is '勤怠管理対象か（true=自社 / false=協力店社は打刻履歴のみ・改善基準の違反判定を行わない）';

create index if not exists idx_shifts_confirmed on public.shifts (month_key, confirmed);
