-- 0022_dispatch_affiliation.sql
-- 流れ表の乗務員名の上に「所属＝社名」を表示するため、配車に所属(社名)列を追加。
--   協力(子車)行は driver_id を結ばない＝ドライバーの affiliation では社名を出せないため、
--   シートの所属列(社名: オーヤカーゴ / 大樹興業 等)を配車行そのものに保存する。非破壊・冪等。
alter table public.dispatch_plans add column if not exists affiliation text;
comment on column public.dispatch_plans.affiliation is 'シート所属列(社名)。協力店社名の表示に使用';
