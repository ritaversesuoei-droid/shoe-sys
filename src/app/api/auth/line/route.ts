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
      // LINEログイン未設定は「未提供(503)」を返す（500=内部エラーにしない・監視の誤検知回避）
      return fail("LINEログインは未設定です（ID/パスワードでログインしてください）", 503);
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
        console.error("[auth/line] createUser失敗:", createErr?.message);
        return fail("認証処理に失敗しました", 500);
      }
      const { error: profErr } = await admin.from("profiles").insert({
        id: created.user.id,
        role: "driver",
        driver_id: driver.id,
        display_name: driver.name,
      });
      if (profErr) {
        console.error("[auth/line] profiles作成失敗:", profErr.message);
        return fail("認証処理に失敗しました", 500);
      }
    }

    // (4) サーバー側サインイン → セッション cookie 確立
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      console.error("[auth/line] signIn失敗:", signInErr.message);
      return fail("認証処理に失敗しました", 500);
    }

    return ok({ driverId: driver.id, name: driver.name });
  });
}
