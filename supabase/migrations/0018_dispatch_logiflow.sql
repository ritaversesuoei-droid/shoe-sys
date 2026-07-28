-- 0018_dispatch_logiflow.sql
-- LOGI-FLOW NAVI（流れ表 編集画面）用に dispatch_plans を粒度化。追加のみ・非破壊。
--   arrival_date : 着荷日（翌日送り/AM判定に使用。plan_date=積込日）
--   origin_spot  : 積地（発地）
--   arrival_time : 到着時間指定
--   sort_no      : 表示順（ドライバー内の案件並び）
alter table public.dispatch_plans
  add column if not exists arrival_date date,
  add column if not exists origin_spot  text,
  add column if not exists arrival_time text,
  add column if not exists sort_no      integer;

comment on column public.dispatch_plans.arrival_date is 'LOGI-FLOW: 着荷日（翌日送り/AM判定用・plan_date=積込日）';
comment on column public.dispatch_plans.origin_spot  is 'LOGI-FLOW: 積地(発地)';
comment on column public.dispatch_plans.arrival_time is 'LOGI-FLOW: 到着時間指定';
comment on column public.dispatch_plans.sort_no      is 'LOGI-FLOW: ドライバー内の案件並び順';

create index if not exists idx_dispatch_plans_arrival on public.dispatch_plans (arrival_date);
