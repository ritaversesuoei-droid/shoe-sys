import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLineIdToken } from "@/lib/line/client";
import { getServerEnv } from "@/lib/env";
import { ok, fail, handle } from "@/lib/api/response";
import { lineLoginSchema } from "@/lib/validation";

/**
 * POST /api/auth/line  ドライバー LINE ログイン（仕様書 F-01 / 4.2）
 *   1. LIFF の ID トークンを検証（aud = LINEログインチャネルID）
 *   2. line_user_id でドライバーマスタを照合（未登録は 403）
 *   3. Supabase Auth ユーザーをプロビジョニング（profiles で driver_id 紐付け）
 *   4. サーバーでサインインしてセッション cookie を確立
 *
 * 設計メモ: LINE はネイティブの Supabase プロバイダではないため、
 *   決定的メール+決定的パスワード方式で Auth ユーザーを橋渡しする。
 *   パスワードは service_role を鍵に sub から HMAC 導出（サーバー外に出ない）。
 */
function deriveCredentials(sub: string, secret: string) {
  const email = `line.${sub}@drivers.shoei.local`;
  const password = crypto
    .createHmac("sha256", secret)
    .update(`driver:${sub}`)
    .digest("hex");
  return { email, password };
}

export async function POST(request: Request) {
  return handle(async () => {
    const env = getServerEnv();
    if (!env.LINE_LOGIN_CHANNEL_ID) {
      return fail("LINE_LOGIN_CHANNEL_ID が未設定です", 500);
    }
    const { id_token } = lineLoginSchema.parse(await request.json());

    // (1) IDトークン検証
    const verified = await verifyLineIdToken(id_token, env.LINE_LOGIN_CHANNEL_ID);
    if (!verified) return fail("LINE認証に失敗しました", 401);

    const admin = createAdminClient();

    // (2) ドライバーマスタ照合
    const { data: driver } = await admin
      .from("drivers")
      .select("id, is_active, name")
      .eq("line_user_id", verified.sub)
      .maybeSingle();
    if (!driver) return fail("未登録のドライバーです。管理者に連絡してください", 403);
    if (!driver.is_active) return fail("無効なアカウントです", 403);

    const { email, password } = deriveCredentials(
      verified.sub,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // (3) Auth ユーザー + profiles を用意（既存は profiles から特定）
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (!existingProfile) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { line_user_id: verified.sub, driver_id: driver.id },
      });
      if (createErr || !created.user) {
        return fail(`ユーザー作成に失敗: ${createErr?.message ?? "unknown"}`, 500);
      }
      const { error: profErr } = await admin.from("profiles").insert({
        id: created.user.id,
        role: "driver",
        driver_id: driver.id,
        display_name: driver.name,
      });
      if (profErr) return fail(profErr.message, 500);
    }

    // (4) サーバー側サインイン → セッション cookie 確立
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) return fail(`サインイン失敗: ${signInErr.message}`, 500);

    return ok({ driverId: driver.id, name: driver.name });
  });
}
