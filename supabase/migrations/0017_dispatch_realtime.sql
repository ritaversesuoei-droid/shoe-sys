-- 0017_dispatch_realtime.sql
-- 配車表の即時反映用。dispatch_plans を Supabase Realtime の publication に追加する。
-- （TROUD直連携 /api/troud/sync での更新を /admin/dispatch へ即反映する。events/compliance_alerts と同様）
-- 冪等・非破壊。publication 未作成の環境やプラン差異でも失敗しないようガード。
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dispatch_plans'
     ) then
    alter publication supabase_realtime add table public.dispatch_plans;
  end if;
end $$;
