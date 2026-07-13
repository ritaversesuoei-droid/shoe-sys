-- 0013_rest_events.sql
-- ② 一般休憩（勤務中の30分休憩）の打刻を追加: rest_start / rest_end
--
--   long_rest（長距離休憩）は勤務をクローズする種別だが、こちらは
--   「連続運転4時間ごと・おおむね30分以上の休憩」（改善基準告示）を勤務継続のまま
--   記録するための in-shift イベント。位置情報を伴い、open/close はしない。
--   ドライバー端末で「開始時刻」「30分タイマー」を表示する（見忘れ防止）。
--
-- 既存の CHECK 制約（列レベル・既定名 events_event_type_check）を張り替える追加変更。

alter table public.events drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type in (
    'departure', 'leg_departure', 'arrival',
    'loading', 'unloading', 'long_rest', 'clock_out',
    'rest_start', 'rest_end'));
