-- ============================================================
-- 0003: 運行オペレーション（勤務・打刻イベント・明細・写真）
-- ============================================================
-- 仕様書 7.2 / 4.3。打刻種別は移行時にクレンジングして安定キー（英語）へ正規化する（11.2）。

-- ------------------------------------------------------------
-- shifts（勤務 = 1出発〜退勤の単位） 仕様書 7.2 / 4.3.2 / 6.1
-- ------------------------------------------------------------
create table public.shifts (
  id                    uuid primary key default gen_random_uuid(),  -- 現行 SH-xxx
  driver_id             uuid not null references public.drivers (id),
  work_date             date not null,                  -- 運行日（基準日）
  month_key             text not null,                  -- yyyyMM（集計用）
  clock_in_at           timestamptz,                    -- 確定出勤日時
  clock_out_at          timestamptz,                    -- 確定退勤日時
  actual_in             time,                           -- 実績出勤
  actual_out            time,                           -- 実績退勤
  edited_in             time,                           -- 修正出勤
  edited_out            time,                           -- 修正退勤
  edited_in_adj_days    int not null default 0,         -- 出勤側 日跨ぎ補正(日数)
  edited_out_adj_days   int not null default 0,         -- 退勤側 日跨ぎ補正(日数)
  rest_time             interval not null default '0',  -- 休憩時間（勤務内）
  restraint_min         int,                            -- 拘束時間（分）F-11
  labor_min             int,                            -- 労働時間（分）
  night_min             int,                            -- 深夜労働（分）
  rest_period_min       int,                            -- 休息期間（分, 前勤務退勤→当勤務出勤）
  warn_restraint        text,                           -- 拘束 警告メモ
  warn_rest             text,                           -- 休息 警告メモ
  revision_status       text not null default 'none'    -- 修正有無
                        check (revision_status in ('none', 'edited')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.shifts is '勤務（出発〜退勤の1単位 / 仕様書 4.3.2 用語・7.2）。長距離は複数日にまたがる';
create index idx_shifts_driver_date on public.shifts (driver_id, work_date);
create index idx_shifts_month_key on public.shifts (month_key);
create index idx_shifts_clock_in on public.shifts (clock_in_at);

create trigger trg_shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- events（打刻イベント） 仕様書 7.2 / 4.3
--   event_type 安定キー（英↔日対応）:
--     departure    = 出発（出庫）       … shift新規作成
--     leg_departure= 長距離各駅出発     … shift新規作成・アルコール写真必須
--     arrival      = 到着報告
--     loading      = 積込完了
--     unloading    = 荷卸完了
--     long_rest    = 長距離休憩         … 退勤時刻記入・日報は下書き維持
--     clock_out    = 退勤（帰庫）       … 退勤時刻記入・日報確定→PDF
-- ------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),  -- 現行 EV-xxx
  driver_id       uuid not null references public.drivers (id),
  shift_id        uuid references public.shifts (id) on delete set null,  -- 紐付き勤務（NULL可）
  event_type      text not null check (event_type in (
                    'departure', 'leg_departure', 'arrival',
                    'loading', 'unloading', 'long_rest', 'clock_out')),
  occurred_at     timestamptz not null,                 -- 発生日時
  vehicle_no      text,                                 -- 車番
  address         text,                                 -- 報告場所（逆ジオコーディング）
  lat             numeric(10, 7),
  lng             numeric(10, 7),
  customer_id     uuid references public.customers (id),-- 推定客先（F-22）
  checks          text,                                 -- 確認項目（荷卸の品種確認 等）
  alcohol_checked boolean,                              -- アルコールチェック実施（長距離で必須）
  note            text,
  idempotency_key text not null unique,                 -- 冪等キー（仕様 4.3.4 優先キー/クライアント生成UUID）
  created_at      timestamptz not null default now()
);
comment on table public.events is '打刻イベント（仕様書 4.3 / 7.2）。冪等キーで再送・重複防止';
create index idx_events_driver_occurred on public.events (driver_id, occurred_at);
create index idx_events_shift on public.events (shift_id);
create index idx_events_type on public.events (event_type);

-- ------------------------------------------------------------
-- event_items（積込/荷卸 明細 = 1打刻に最大3件） 仕様書 7.2 正規化判断(C)
--   現行「改行区切り1セル多件詰め」を解消し、1明細=1行へ正規化。
-- ------------------------------------------------------------
create table public.event_items (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  seq            int not null default 1,                -- 表示順(1-3)
  shipper        text,                                  -- 荷主
  delivery_spot  text,                                  -- 着荷地
  quantity       text,                                  -- 数量
  weight         text,                                  -- 重量
  slip_no        text,                                  -- 伝票
  receipts       text,                                  -- 受領書枚数（荷卸）
  cargo_type     text,                                  -- 品種（荷卸の品種確認）
  note           text,
  created_at     timestamptz not null default now(),
  unique (event_id, seq)
);
comment on table public.event_items is '打刻明細（積込/荷卸の複数件 / 仕様書 7.2 正規化判断C）';
create index idx_event_items_event on public.event_items (event_id);

-- ------------------------------------------------------------
-- event_photos（打刻写真） 仕様書 4.3.5 / 7.2
--   実体は Supabase Storage。例: photos/{yyyymm}/{driver_id}/{event_id}_{n}.jpg
-- ------------------------------------------------------------
create table public.event_photos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  storage_path  text not null,                          -- Storage内パス
  category      text,                                   -- 区分（荷姿/アルコールチェック 等）
  seq           int not null default 1,
  created_at    timestamptz not null default now()
);
comment on table public.event_photos is '打刻写真メタ（仕様書 4.3.5）。本体はStorage、公開は署名付きURL';
create index idx_event_photos_event on public.event_photos (event_id);
