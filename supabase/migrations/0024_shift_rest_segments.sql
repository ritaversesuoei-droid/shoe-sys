-- 0024: 休憩の時刻区間（深夜/日中の自動判定）
--   勤怠修正で休憩を「開始/終了 時刻」で入力できるようにし、22:00-05:00 にかかった分を
--   深夜休憩として深夜労働から自動控除する（計算は既存の nightBreakMin ロジックを利用）。
--   rest_segments: [{ "startIso": ..., "endIso": ... }] （JST基準で保存された ISO 区間）
--   night_rest_min: そのうち深夜(22-5)にかかった休憩分（月次の「休憩(深夜)」表示・深夜控除の記録）
alter table public.shifts add column if not exists rest_segments jsonb;
alter table public.shifts add column if not exists night_rest_min integer;

comment on column public.shifts.rest_segments is '休憩の時刻区間 [{startIso,endIso}]（勤怠修正で時刻入力・深夜/日中判定用）';
comment on column public.shifts.night_rest_min is '休憩のうち深夜(22-5)にかかった分（深夜労働から控除済み）';
