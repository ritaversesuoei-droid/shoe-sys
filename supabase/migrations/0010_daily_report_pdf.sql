-- ============================================================
-- 0010: 日報の生成PDF参照（F-17/18 サーバー側自動生成）
-- ============================================================
-- 確定時にサーバーで生成したPDFのStorageパスと生成時刻を保持。
-- 署名URLはパスから都度発行（URLは失効するため保存しない）。

alter table public.daily_reports
  add column if not exists pdf_path         text,
  add column if not exists pdf_generated_at timestamptz;

comment on column public.daily_reports.pdf_path is '生成PDFのStorageパス（reports バケット）。署名URLは都度発行';
