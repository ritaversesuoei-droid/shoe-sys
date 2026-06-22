import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";
import { AuthError } from "@/lib/errors";

export { AuthError };

export interface SessionContext {
  userId: string;
  role: ProfileRole;
  driverId: string | null;
  displayName: string | null;
}

/**
 * 現在のリクエストの認証コンテキストを返す（未認証は null）。
 * 仕様書 7.3: role と driver_id でアクター（管理者/ドライバー）を判別。
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, driver_id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: (profile?.role ?? "driver") as ProfileRole,
    driverId: profile?.driver_id ?? null,
    displayName: profile?.display_name ?? null,
  };
}

/** 管理者であることを要求。違反時は AuthError(401/403)。 */
export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new AuthError("未認証です", 401);
  if (ctx.role !== "admin") throw new AuthError("管理者権限が必要です", 403);
  return ctx;
}

/** ドライバー本人であることを要求（driver_id 必須）。 */
export async function requireDriver(): Promise<SessionContext & { driverId: string }> {
  const ctx = await getSessionContext();
  if (!ctx) throw new AuthError("未認証です", 401);
  if (!ctx.driverId) throw new AuthError("ドライバー紐付けがありません", 403);
  return { ...ctx, driverId: ctx.driverId };
}
