-- 0020_fuel_logs.sql
-- 燃費（給油記録）: 現行GAS「給油記録」シート＋アプリの移植。
--   ドライバーが給油のたびに記録し、走行距離(delta_km)・今回燃費(fuel_km_l)は
--   サーバー側で計算して保存する（車両単位のオドメーター連続・つなぎ給油合算・満タン基準）。
--   マスタ（目標燃費・P/Wランク・正常燃費レンジ）は drivers に追加列で持つ。

-- ── 給油記録テーブル ──────────────────────────────────────────
create table if not exists public.fuel_logs (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  driver_id    uuid references public.drivers(id) on delete set null,
  driver_code  text,                 -- 社員番号（スナップショット）
  driver_name  text,                 -- 給油作業者名（スナップショット）
  vehicle_no   text not null,        -- 車両番号
  station      text,                 -- 給油場所（宇佐美鉱油 / トラック組合 など）
  odometer     integer not null,     -- 給油時オドメーター(km)
  liters       numeric(6,1) not null,-- 給油量(L)
  is_full      boolean not null default true, -- true=満タン給油 / false=つなぎ給油
  fuel_km_l    numeric(6,2),         -- 今回燃費（満タン時のみ・つなぎ合算で算出）
  delta_km     integer not null default 0,    -- 走行距離（前回給油ODDとの差）
  month_key    text not null,        -- yyyyMM（JST・月次集計キー）
  created_at   timestamptz not null default now()
);

create index if not exists fuel_logs_vehicle_time_idx on public.fuel_logs (vehicle_no, occurred_at);
create index if not exists fuel_logs_month_idx on public.fuel_logs (month_key);
create index if not exists fuel_logs_driver_idx on public.fuel_logs (driver_id);

alter table public.fuel_logs enable row level security;

-- ドライバーは自分の給油記録を作成・参照。管理者は全件。
-- （SQL Editor での手動実行・再実行でも失敗しないよう drop if exists で冪等化）
drop policy if exists fuel_logs_select on public.fuel_logs;
create policy fuel_logs_select on public.fuel_logs
  for select using (driver_id = public.current_driver_id() or public.is_admin());
drop policy if exists fuel_logs_insert on public.fuel_logs;
create policy fuel_logs_insert on public.fuel_logs
  for insert with check (driver_id = public.current_driver_id() or public.is_admin());
drop policy if exists fuel_logs_admin_update on public.fuel_logs;
create policy fuel_logs_admin_update on public.fuel_logs
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists fuel_logs_admin_delete on public.fuel_logs;
create policy fuel_logs_admin_delete on public.fuel_logs
  for delete using (public.is_admin());

-- ── drivers に燃費マスタ列を追加 ─────────────────────────────
alter table public.drivers add column if not exists target_fuel_km_l numeric(6,2); -- 目標(基準)燃費
alter table public.drivers add column if not exists prize_rank text;               -- P/Wランク（①〜⑤ / 0⃣）
alter table public.drivers add column if not exists normal_fuel_min numeric(6,2);  -- 正常燃費レンジ 下限
alter table public.drivers add column if not exists normal_fuel_max numeric(6,2);  -- 正常燃費レンジ 上限
