import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "reports";

/** 帳票用の非公開バケットを用意（冪等）。公開は署名付きURLのみ。 */
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.storage.createBucket(BUCKET, { public: false });
  if (error && !/exist|already/i.test(error.message)) throw error;
}

/**
 * PDF を Storage に保存し、署名付きURL（既定1時間）を返す（仕様書 F-17 / 4.3.5 非公開）。
 * @param path 例: 202606/<driverId>/2026-06-20.pdf
 */
export async function storeReportPdf(
  path: string,
  pdf: Uint8Array,
  expiresInSec = 3600,
): Promise<string> {
  const admin = createAdminClient();
  await ensureBucket(admin);

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(pdf), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) throw error;

  const { data, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (signErr || !data) throw signErr ?? new Error("署名付きURLの生成に失敗しました");
  return data.signedUrl;
}
