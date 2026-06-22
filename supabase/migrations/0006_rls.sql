-- ============================================================
-- 0006: 行レベルセキュリティ（RLS） 仕様書 7.3 / 10. / 12.1-#2
-- ============================================================
-- 方針: ドライバーは自分の行のみ、管理者は全件。
--   現行は「URLを知れば誰でもアクセス可」→ Supabase Auth + RLS + ロール制御で根本解消。

-- ------------------------------------------------------------
-- 認証ヘルパー（SECURITY DEFINER で profiles を RLS 非依存に参照し、再帰を回避）
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
comment on function public.is_admin() is '現在のユーザーが管理者ロールか（仕様書 7.3）';

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.driver_id from public.profiles p where p.id = auth.uid();
$$;
comment on function public.current_driver_id() is '現在のユーザーに紐付くドライバーID（仕様書 7.3）';

-- ------------------------------------------------------------
-- RLS 有効化
-- ------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.drivers             enable row level security;
alter table public.vehicles            enable row level security;
alter table public.customers           enable row level security;
alter table public.shifts              enable row level security;
alter table public.events              enable row level security;
alter table public.event_items         enable row level security;
alter table public.event_photos        enable row level security;
alter table public.daily_reports       enable row level security;
alter table public.daily_report_legs   enable row level security;
alter table public.daily_report_rests  enable row level security;
alter table public.compliance_alerts   enable row level security;
alter table public.dispatch_plans      enable row level security;
alter table public.line_usage          enable row level security;
alter table public.app_settings        enable row level security;

-- ------------------------------------------------------------
-- profiles: 本人は自分の行を参照、管理者は全件
-- ------------------------------------------------------------
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- drivers: 本人の行のみ select、管理者は全件 CRUD
-- ------------------------------------------------------------
create policy drivers_select_self on public.drivers
  for select using (id = public.current_driver_id() or public.is_admin());
create policy drivers_admin_all on public.drivers
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- vehicles / customers: 認証済みは参照可（リファレンス）、管理者は CRUD
-- ------------------------------------------------------------
create policy vehicles_select_auth on public.vehicles
  for select using (auth.role() = 'authenticated');
create policy vehicles_admin_all on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

create policy customers_select_auth on public.customers
  for select using (auth.role() = 'authenticated');
create policy customers_admin_all on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- shifts: 本人は自分の行を select/insert/update、管理者は全件
-- ------------------------------------------------------------
create policy shifts_select on public.shifts
  for select using (driver_id = public.current_driver_id() or public.is_admin());
create policy shifts_insert on public.shifts
  for insert with check (driver_id = public.current_driver_id() or public.is_admin());
create policy shifts_update on public.shifts
  for update using (driver_id = public.current_driver_id() or public.is_admin())
  with check (driver_id = public.current_driver_id() or public.is_admin());
create policy shifts_admin_delete on public.shifts
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- events: 本人は自分の行を select/insert/update、管理者は全件
-- ------------------------------------------------------------
create policy events_select on public.events
  for select using (driver_id = public.current_driver_id() or public.is_admin());
create policy events_insert on public.events
  for insert with check (driver_id = public.current_driver_id() or public.is_admin());
create policy events_update on public.events
  for update using (driver_id = public.current_driver_id() or public.is_admin())
  with check (driver_id = public.current_driver_id() or public.is_admin());
create policy events_admin_delete on public.events
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- event_items / event_photos: 親 event の所有者に従う
-- ------------------------------------------------------------
create policy event_items_via_parent on public.event_items
  for all using (
    exists (select 1 from public.events e where e.id = event_id
            and (e.driver_id = public.current_driver_id() or public.is_admin()))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id
            and (e.driver_id = public.current_driver_id() or public.is_admin()))
  );

create policy event_photos_via_parent on public.event_photos
  for all using (
    exists (select 1 from public.events e where e.id = event_id
            and (e.driver_id = public.current_driver_id() or public.is_admin()))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id
            and (e.driver_id = public.current_driver_id() or public.is_admin()))
  );

-- ------------------------------------------------------------
-- daily_reports: 本人は自分の行を select/insert/update、管理者は全件
-- ------------------------------------------------------------
create policy daily_reports_select on public.daily_reports
  for select using (driver_id = public.current_driver_id() or public.is_admin());
create policy daily_reports_insert on public.daily_reports
  for insert with check (driver_id = public.current_driver_id() or public.is_admin());
create policy daily_reports_update on public.daily_reports
  for update using (driver_id = public.current_driver_id() or public.is_admin())
  with check (driver_id = public.current_driver_id() or public.is_admin());
create policy daily_reports_admin_delete on public.daily_reports
  for delete using (public.is_admin());

-- daily_report_legs / rests: 親 daily_report の所有者に従う
create policy legs_via_parent on public.daily_report_legs
  for all using (
    exists (select 1 from public.daily_reports r where r.id = daily_report_id
            and (r.driver_id = public.current_driver_id() or public.is_admin()))
  ) with check (
    exists (select 1 from public.daily_reports r where r.id = daily_report_id
            and (r.driver_id = public.current_driver_id() or public.is_admin()))
  );

create policy rests_via_parent on public.daily_report_rests
  for all using (
    exists (select 1 from public.daily_reports r where r.id = daily_report_id
            and (r.driver_id = public.current_driver_id() or public.is_admin()))
  ) with check (
    exists (select 1 from public.daily_reports r where r.id = daily_report_id
            and (r.driver_id = public.current_driver_id() or public.is_admin()))
  );

-- ------------------------------------------------------------
-- compliance_alerts: ドライバーは自分の行を select のみ、管理者は全件 select/update
-- ------------------------------------------------------------
create policy alerts_select on public.compliance_alerts
  for select using (driver_id = public.current_driver_id() or public.is_admin());
create policy alerts_admin_write on public.compliance_alerts
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- dispatch_plans: ドライバーは自分の予定のみ select、管理者は全件
-- ------------------------------------------------------------
create policy dispatch_plans_select on public.dispatch_plans
  for select using (driver_id = public.current_driver_id() or public.is_admin());
create policy dispatch_plans_admin_all on public.dispatch_plans
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- app_settings: 認証済みは参照可（判定パラメータ）、管理者のみ変更
-- ------------------------------------------------------------
create policy app_settings_select_auth on public.app_settings
  for select using (auth.role() = 'authenticated');
create policy app_settings_admin_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- line_usage: 管理者のみ参照。書込みは service_role（RLSバイパス）想定。
-- ------------------------------------------------------------
create policy line_usage_admin_select on public.line_usage
  for select using (public.is_admin());
