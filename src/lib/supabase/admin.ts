import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { clientEnv, getServerEnv } from "@/lib/env";

/**
 * service_role クライアント（RLS をバイパス）。
 * サーバー内部処理専用:
 *  - LINE ログイン時のユーザープロビジョニング（profiles 作成）
 *  - 据置端末（端末認証）の代行書込み
 *  - 集計・通知カウンタ・移行スクリプト
 * 絶対にクライアントへ露出しないこと（server-only で保護）。
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
