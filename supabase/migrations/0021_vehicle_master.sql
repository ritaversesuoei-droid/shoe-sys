-- 0021_vehicle_master.sql
-- 車両マスタの拡充: 登録日・車検満了日・備考を追加（車種 kind は既存列を使用）。
--   全車両の一覧管理＋いつ登録したか・車検などの記録に使う。非破壊・冪等。
alter table public.vehicles add column if not exists registered_on date;       -- 登録日
alter table public.vehicles add column if not exists inspection_expiry date;   -- 車検満了日
alter table public.vehicles add column if not exists note text;                -- 備考（任意）
comment on column public.vehicles.registered_on is '車両マスタ登録日';
comment on column public.vehicles.inspection_expiry is '車検満了日';
