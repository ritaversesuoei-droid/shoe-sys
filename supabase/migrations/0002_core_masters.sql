-- ============================================================
-- 0002: マスタ系 & プロフィール（認証ロール）
-- ============================================================
-- 仕様書 7.2: drivers / vehicles / customers
-- profiles は Supabase Auth(auth.users) とアプリ内ロール(admin/driver)を橋渡しする。

-- ------------------------------------------------------------
-- drivers（ドライバーマスタ） 仕様書 7.2
-- ------------------------------------------------------------
create table public.drivers (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,            -- 2桁業務ID（現行ローカルコード）
  name                text not null,                   -- 氏名
  line_user_id        text unique,                     -- LINEユーザーID（LIFFログイン紐付け）
  line_chat_url       text,                            -- 個別チャットURL
  default_vehicle_no  text,                            -- 既定車番
  affiliation         text,                            -- 所属（自社/子車 等）
  is_active           boolean not null default true,   -- 在籍フラグ
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.drivers is 'ドライバーマスタ（仕様書 F-01 / 7.2）。約28名。code=2桁業務ID';

create trigger trg_drivers_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- vehicles（車両マスタ） 仕様書 7.2 / 11.1
-- ------------------------------------------------------------
create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  vehicle_no   text not null unique,                   -- 車番
  name         text,                                   -- 通称・車種名
  kind         text,                                   -- 区分（大型/中型 等）
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.vehicles is '車両マスタ（仕様書 7.2）';

create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- customers（客先マスタ） 仕様書 7.2 / F-22
--   逆ジオコーディングで得た住所 → 郵便番号・屋号で客先名を推定/学習する。
-- ------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  postal_code  text,                                   -- 郵便番号
  address      text,                                   -- 住所
  name         text not null,                          -- 客先名
  yago         text,                                   -- 屋号（住所からの推定キー）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.customers is '客先マスタ（仕様書 F-22 客先名・屋号マスタ学習）';
create index idx_customers_postal_code on public.customers (postal_code);
create index idx_customers_yago on public.customers (yago);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- profiles（認証ロール） 仕様書 4.2 / 7.3
--   auth.users と 1:1。role で管理者/ドライバーを判別、driver_id でドライバー本人を特定。
-- ------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'driver' check (role in ('admin', 'driver')),
  driver_id   uuid references public.drivers (id) on delete set null,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Supabase Auth ユーザーのアプリ内ロール（仕様書 7.3 RLS基盤）。role=admin/driver';
create unique index idx_profiles_driver_id on public.profiles (driver_id) where driver_id is not null;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
