-- ============================================================
-- 0005: 違反台帳 / 配車予定 / LINE使用量 / システム設定
-- ============================================================
-- 仕様書 7.2 / F-12,F-13 / F-09 / F-20 / 6章。

-- ------------------------------------------------------------
-- compliance_alerts（違反・是正台帳, shiftと1:1） 仕様書 F-13 / 7.2 / 状態遷移5.3
--   改善基準告示の違反を shift ごとに1行で管理。ソフト解消（status=resolved）で監査証跡を保持（13章D）。
-- ------------------------------------------------------------
create table public.compliance_alerts (
  id                 uuid primary key default gen_random_uuid(),
  shift_id           uuid not null unique references public.shifts (id) on delete cascade, -- 1:1
  driver_id          uuid not null references public.drivers (id),
  work_date          date not null,
  month_key          text not null,
  alert_types        text[] not null default '{}',      -- 違反種別配列（restraint/rest/night/continuous_drive/...）
  restraint_min      int,                               -- 判定時スナップショット
  labor_min          int,
  rest_period_min    int,
  night_min          int,
  detail             jsonb not null default '{}'::jsonb, -- 判定内訳（閾値・超過量等）
  status             text not null default 'open'        -- open / resolved
                     check (status in ('open', 'resolved')),
  correction_reason  text,                              -- 是正理由（F-13）
  correction_note    text,                              -- 是正指導内容
  corrected_by       uuid references public.profiles (id),
  corrected_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.compliance_alerts is '違反・是正台帳（仕様書 F-13 / 7.2）。shiftと1:1、ソフト解消で監査証跡保持(13章D)';
create index idx_alerts_driver_month on public.compliance_alerts (driver_id, month_key);
create index idx_alerts_status on public.compliance_alerts (status);

create trigger trg_alerts_updated_at
  before update on public.compliance_alerts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- dispatch_plans（配車/運車予定） 仕様書 F-09 / 7.2 / 11.1
--   移行時: 数字の名寄せ（子車含む）が必要。driver_id 未確定の生データを driver_name_raw に保持。
-- ------------------------------------------------------------
create table public.dispatch_plans (
  id                 uuid primary key default gen_random_uuid(),
  plan_date          date not null,                     -- 物込日（当日予定の基準日）
  driver_id          uuid references public.drivers (id), -- 名寄せ後（NULL可）
  driver_name_raw    text,                              -- 移行/取込時の生ドライバー名
  vehicle_no         text,
  shipper            text,                              -- 荷主
  delivery_spot      text,                              -- 着荷地
  highway_instruction text,                             -- 高速指示
  is_subcontract     boolean not null default false,    -- 子車
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.dispatch_plans is '配車/運車予定（仕様書 F-09）。当日予定の取得元、積込フォームへ転記';
create index idx_dispatch_plans_date on public.dispatch_plans (plan_date);
create index idx_dispatch_plans_driver on public.dispatch_plans (driver_id, plan_date);

create trigger trg_dispatch_plans_updated_at
  before update on public.dispatch_plans
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- line_usage（月次LINE通知数） 仕様書 F-20 / 12.2-#6
--   月キー付きカウンタ。月初リセットなしでも月毎に分離（暦月またぎ事故の防止）。
-- ------------------------------------------------------------
create table public.line_usage (
  month_key    text primary key,                        -- yyyyMM
  sent_count   int not null default 0,                  -- 当月送信数
  limit_count  int,                                     -- 上限（プラン月上限の目安）
  updated_at   timestamptz not null default now()
);
comment on table public.line_usage is 'LINE通知 月次使用量（仕様書 F-20 / 改善: 月キー付きカウンタ）';

create trigger trg_line_usage_updated_at
  before update on public.line_usage
  for each row execute function public.set_updated_at();

-- 通知1件をアトミックにカウントアップ（upsert）。push 送信成功時にサーバーから呼ぶ。
create or replace function public.increment_line_usage(p_month_key text, p_delta int default 1)
returns void
language sql
as $$
  insert into public.line_usage (month_key, sent_count)
  values (p_month_key, p_delta)
  on conflict (month_key)
  do update set sent_count = public.line_usage.sent_count + excluded.sent_count,
                updated_at = now();
$$;

-- ------------------------------------------------------------
-- app_settings（システム設定 / 判定パラメータ） 仕様書 7.2 / 6章 / 12.2-#5
--   改善基準告示の閾値などを構成管理。キー=value(jsonb)。
-- ------------------------------------------------------------
create table public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now()
);
comment on table public.app_settings is 'システム設定（仕様書 7.2）。改善基準告示の判定パラメータ等を構成管理';

create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
