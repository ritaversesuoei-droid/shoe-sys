-- ============================================================
-- 0008: Storage バケット（打刻写真） 仕様書 4.3.5 / 10.
-- ============================================================
-- 非公開バケット。公開は署名付きURL（有効期限付き）でのみ行う（現行「URLを知れば全員閲覧可」を解消）。
-- パス規約: {yyyymm}/{driver_id}/{event_id}_{n}.jpg

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

-- ドライバーは自分の driver_id 配下のみ読み書き、管理者は全件。
-- name 例: '202606/<driver_id>/<event_id>_1.jpg' → foldername[2] = driver_id
create policy event_photos_storage_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'event-photos' and (
      public.is_admin()
      or (storage.foldername(name))[2] = public.current_driver_id()::text
    )
  )
  with check (
    bucket_id = 'event-photos' and (
      public.is_admin()
      or (storage.foldername(name))[2] = public.current_driver_id()::text
    )
  );
