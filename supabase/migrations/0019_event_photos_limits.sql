-- ============================================================
-- 0019: event-photos バケットに MIME/サイズ制限を付与
-- ============================================================
-- 背景: バケット作成時(0008)に allowed_mime_types / file_size_limit が未指定のため、
--   認証済みドライバーが PunchForm を経由せず自フォルダ(RLS許可範囲)へ content-type 任意・
--   任意サイズのオブジェクトを直接アップロードできた。管理者が写真ギャラリーの署名URLを
--   新規タブで直接開くと、保存時 content-type(=攻撃者制御) で配信され内容偽装(HTML配信)の
--   余地があった。加えて巨大ファイルによるストレージ濫用の懸念。
-- 対策: 打刻写真は JPEG/PNG のみ・最大5MB に制限（バケット側で許可MIME外を拒否）。
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png'],
    file_size_limit = 5242880  -- 5MB
where id = 'event-photos';
