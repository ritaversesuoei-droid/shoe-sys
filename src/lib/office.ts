import "server-only";

import { getServerEnv } from "@/lib/env";
import { AuthError } from "@/lib/errors";

/**
 * 据置端末（事務所共用）の端末認証（仕様書 F-01: 端末認証）。
 * 共有トークンを x-office-token ヘッダで受け取り、環境変数と定数時間風に比較する。
 * 端末はキオスク運用前提。トークン未設定時は据置端末APIを無効化（403）。
 */
export function verifyOfficeToken(request: Request): void {
  const { OFFICE_TERMINAL_TOKEN } = getServerEnv();
  if (!OFFICE_TERMINAL_TOKEN) {
    throw new AuthError("据置端末は未設定です（OFFICE_TERMINAL_TOKEN）", 403);
  }
  const provided = request.headers.get("x-office-token") ?? "";
  if (provided.length !== OFFICE_TERMINAL_TOKEN.length || provided !== OFFICE_TERMINAL_TOKEN) {
    throw new AuthError("端末トークンが不正です", 401);
  }
}
