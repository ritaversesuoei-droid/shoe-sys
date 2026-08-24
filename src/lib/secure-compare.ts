import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 定数時間での文字列一致判定（トークン/秘密鍵の検証用）。
 *   両者を SHA-256（常に32バイト）へ畳んでから timingSafeEqual で比較するため、
 *   - 早期リターンによる時間差（1文字ずつの推定）を与えない
 *   - 長さの不一致で timingSafeEqual が throw することも、長さが漏れることもない
 *   秘密は高エントロピー前提のため、ダイジェスト一致＝入力一致とみなせる。
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** `Authorization: Bearer <secret>` を定数時間で検証。 */
export function verifyBearer(headerValue: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!headerValue || !headerValue.startsWith(prefix)) return false;
  return safeEqual(headerValue.slice(prefix.length), secret);
}
