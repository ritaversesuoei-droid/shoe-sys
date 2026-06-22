import { z } from "zod";

/**
 * 環境変数の検証（仕様書 8.3 / 10. / 12.1-#1: トークン等は環境変数で管理）。
 * - クライアントに渡るのは NEXT_PUBLIC_ 接頭辞のみ。
 * - サーバー専用値（service_role, LINE トークン）は server 側でのみ参照する。
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).optional(),
  LINE_CHANNEL_SECRET: z.string().min(1).optional(),
  LINE_LOGIN_CHANNEL_ID: z.string().min(1).optional(),
  LINE_ADMIN_TARGET_ID: z.string().optional(),
  APP_TIMEZONE: z.string().default("Asia/Tokyo"),
});

/**
 * サーバー専用環境変数。Server Component / Route Handler / Server Action からのみ呼ぶこと。
 * クライアントバンドルに含めないよう、関数経由で遅延評価する。
 */
export function getServerEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
    LINE_LOGIN_CHANNEL_ID: process.env.LINE_LOGIN_CHANNEL_ID,
    LINE_ADMIN_TARGET_ID: process.env.LINE_ADMIN_TARGET_ID,
    APP_TIMEZONE: process.env.APP_TIMEZONE,
  });
}

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Tokyo";
