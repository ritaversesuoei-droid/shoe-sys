-- ============================================================
-- 0012: 勤怠修正の理由・備考（修正入力 / F-19）
-- ============================================================
-- 管理者が出退勤を手修正した際の理由・備考。監査・現行「修正理由・備考」に対応。

alter table public.shifts
  add column if not exists revision_reason text;

comment on column public.shifts.revision_reason is '勤怠修正の理由・備考（修正入力 / F-19）';
