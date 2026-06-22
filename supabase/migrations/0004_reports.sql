-- ============================================================
-- 0004: 日報（ヘッダ + 運行明細 + 休憩/睡眠）
-- ============================================================
-- 仕様書 7.2 / F-10。現行「1行1明細」→「ヘッダ + 明細」へ再構成（11.1）。
-- 業務ルール(4.6): 「保存」=一時書き(draft)、「確定」=通常退勤打刻時(confirmed)。長距離休憩では確定しない。

-- ------------------------------------------------------------
-- daily_reports（日報ヘッダ） 仕様書 7.2
-- ------------------------------------------------------------
create table public.daily_reports (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.drivers (id),
  shift_id          uuid references public.shifts (id) on delete set null, -- 紐付き運行
  report_date       date not null,                      -- 日報基準日
  status            text not null default 'draft'       -- draft=一時書き / confirmed=確定
                    check (status in ('draft', 'confirmed')),
  vehicle_no        text,
  crew              text,                               -- 乗務員
  departure_at      timestamptz,                        -- 運行開始（総出庫）
  return_at         timestamptz,                        -- 運行終了（総帰庫）
  rest_total_min    int not null default 0,             -- 休憩合計（分）
  meter_start       numeric,                            -- 開始メーター
  meter_end         numeric,                            -- 終了メーター
  has_fatigue       boolean,                            -- 疲労（仮眠等）有無
  drivable          boolean,                            -- 運行可否
  confirm_place     text,                               -- 確認印（場所）
  notes             text,                               -- 特記
  confirmed_at      timestamptz,                        -- 確定日時
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.daily_reports is '日報ヘッダ（仕様書 F-10 / 7.2）。1運行=1日報、draft/confirmed';
create index idx_daily_reports_driver_date on public.daily_reports (driver_id, report_date);
create index idx_daily_reports_shift on public.daily_reports (shift_id);

create trigger trg_daily_reports_updated_at
  before update on public.daily_reports
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- daily_report_legs（運行明細） 仕様書 7.2
-- ------------------------------------------------------------
create table public.daily_report_legs (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports (id) on delete cascade,
  seq              int not null default 1,              -- 行順
  shipper          text,                                -- 荷主
  origin_spot      text,                                -- 発地
  destination_spot text,                                -- 着地
  cargo            text,                                -- 物積（荷物）
  receipts         text,                                -- 受領書
  extra_work       text,                                -- 付帯作業
  meter            numeric,                             -- メーター
  created_at       timestamptz not null default now(),
  unique (daily_report_id, seq)
);
comment on table public.daily_report_legs is '運行明細（仕様書 7.2）。発着地・物積・受領書・付帯作業・メーター';
create index idx_legs_report on public.daily_report_legs (daily_report_id);

-- ------------------------------------------------------------
-- daily_report_rests（休憩・睡眠記録） 仕様書 7.2 / 4.6
-- ------------------------------------------------------------
create table public.daily_report_rests (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports (id) on delete cascade,
  seq              int not null default 1,
  rest_type        text not null default 'rest'         -- rest=休憩 / sleep=睡眠(仮眠)
                   check (rest_type in ('rest', 'sleep')),
  place            text,                                -- 場所（全休憩カードに必須: 4.6）
  start_at         timestamptz,                         -- 開始
  end_at           timestamptz,                         -- 終了（終了<開始 はエラー: 4.6）
  duration_min     int,                                 -- 休憩分（合計90分以上必須: 4.6）
  created_at       timestamptz not null default now(),
  unique (daily_report_id, seq)
);
comment on table public.daily_report_rests is '休憩・睡眠記録（仕様書 4.6 バリデーション対象）';
create index idx_rests_report on public.daily_report_rests (daily_report_id);
