-- ============================================================
-- 0001: 拡張機能 & 共通ヘルパー
-- ============================================================
-- 仕様書 第7章: スプレッドシート(列番号ベース)→ PostgreSQL リレーショナルモデルへ正規化。
-- gen_random_uuid() は PostgreSQL 13+ のコア / Supabase で利用可能。

create extension if not exists "pgcrypto";

-- updated_at 自動更新トリガー関数（各テーブルで共用）
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'BEFORE UPDATE で updated_at を現在時刻に更新する共通トリガー関数';

-- 月キー(yyyyMM, JST基準)を生成するヘルパー。集計(F-14)・カウンタ(line_usage)で使用。
create or replace function public.to_month_key(ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char((ts at time zone 'Asia/Tokyo'), 'YYYYMM');
$$;

comment on function public.to_month_key(timestamptz) is 'JSTローカル日付ベースの yyyyMM 月キーを返す（仕様書 11.2 タイムゾーン統一）';
