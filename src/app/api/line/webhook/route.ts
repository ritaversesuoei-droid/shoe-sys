import { NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line/signature";
import { handleWebhookEvents, type LineWebhookEvent } from "@/lib/line/webhook";
import { isPlaceholder } from "@/lib/line/notify";
import { getServerEnv } from "@/lib/env";

/**
 * POST /api/line/webhook  LINE Webhook 受信（仕様書 8.3, 12.1-#3）
 *   セキュリティ必須: X-Line-Signature 署名検証（生ボディで HMAC-SHA256）。
 *   現行は未検証 → 本実装で必須化。
 *
 * 注意: 署名検証は「生ボディ」で行う必要があるため request.text() を使用する。
 */
export async function POST(request: Request) {
  const env = getServerEnv();
  const secret = env.LINE_CHANNEL_SECRET;
  // 秘密鍵が未設定 or 公開プレースホルダ("your-...")のままなら fail-closed。
  //   プレースホルダはリポジトリ既知値のため、そのまま鍵に使うと誰でも署名を偽造できる。
  //   notify.ts のトークン判定(isPlaceholder)と対称にする。
  if (isPlaceholder(secret)) {
    console.error("[line] LINE_CHANNEL_SECRET 未設定（またはプレースホルダ）");
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature, secret as string)) {
    return NextResponse.json({ success: false, error: "署名検証失敗" }, { status: 401 });
  }

  // 署名検証済み。イベントは best-effort（不正JSON含め失敗してもLINEへは200を返し再送を防ぐ）。低頻度のため同期処理。
  try {
    const payload = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
    await handleWebhookEvents(payload.events ?? []);
  } catch (e) {
    console.error("[line] webhook処理エラー（200は返す）", e);
  }

  return NextResponse.json({ success: true });
}
