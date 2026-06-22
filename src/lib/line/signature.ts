import "server-only";

import crypto from "node:crypto";

/**
 * LINE Webhook 署名検証（仕様書 8.3 / 12.1-#3: X-Line-Signature 検証を必須化）。
 * channelSecret を鍵に、リクエスト生ボディ(raw body)を HMAC-SHA256 → base64 し、
 * ヘッダ x-line-signature と定数時間比較する。
 *
 * 注意: Route Handler では必ず request.text() の「生ボディ」で検証すること（JSON.parse 後は不可）。
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("SHA256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
