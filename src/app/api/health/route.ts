import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// DB接続を確認するため Node ランタイム
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health  稼働確認（デプロイ後スモーク / 死活監視用）
 *   DB到達性と、各設定（環境変数）の有無を返す。秘匿値は出さず boolean のみ。
 *   正常=200 / DB不通・必須未設定=503。
 */
export async function GET() {
  const env = {
    supabase: !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    line_messaging: !!(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN),
    liff: !!process.env.NEXT_PUBLIC_LIFF_ID,
    line_login: !!process.env.LINE_LOGIN_CHANNEL_ID,
    office_terminal: !!process.env.OFFICE_TERMINAL_TOKEN,
    geocoder: process.env.GEOCODER ?? "gsi",
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  let db = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_settings").select("key", { count: "exact", head: true });
    db = !error;
  } catch {
    db = false;
  }

  const ok = db && env.supabase;
  return NextResponse.json(
    { ok, db, env, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
