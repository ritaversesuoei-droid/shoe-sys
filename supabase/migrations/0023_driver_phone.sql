-- 0023: ドライバーの携帯番号（流れ表で氏名の下に表示）
--   マスタで手入力。既存運用に影響しないよう nullable で追加（冪等）。
alter table public.drivers add column if not exists phone text;

comment on column public.drivers.phone is 'ドライバー携帯番号（流れ表表示用・任意）';
