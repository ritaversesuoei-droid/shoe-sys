-- 0014_shift_work_mode.sql
-- 改善基準告示の特例を勤務単位で適用するための作業区分（要社労士確認）。
--   crew_type  : 'single'(通常) / 'double'(2人乗務) … 拘束延長・休息短縮
--   ferry_min  : フェリー乗船分（休息として拘束から控除）
--   split_rest : 分割休息を適用（休息期間の下限を合計10hへ）
-- いずれも既定は「特例なし」＝従来判定と同一。追加のみ・非破壊。

alter table public.shifts
  add column if not exists crew_type  text    not null default 'single'
    check (crew_type in ('single', 'double')),
  add column if not exists ferry_min  integer not null default 0
    check (ferry_min >= 0),
  add column if not exists split_rest boolean not null default false;

comment on column public.shifts.crew_type  is '乗務区分: single=通常 / double=2人乗務（改善基準特例・要社労士確認）';
comment on column public.shifts.ferry_min  is 'フェリー乗船分（休息として拘束から控除・改善基準特例）';
comment on column public.shifts.split_rest is '分割休息の適用（休息期間の下限を合計値へ緩和・改善基準特例）';
