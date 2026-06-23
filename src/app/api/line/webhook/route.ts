import { NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line/signature";
import { handleWebhookEvents, type LineWebhookEvent } from "@/lib/line/webhook";
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
  if (!env.LINE_CHANNEL_SECRET) {
    console.error("[line] LINE_CHANNEL_SECRET 未設定");
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ success: false, error: "署名検証失敗" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
  // 友だち追加→連携案内 / 番号送信→ドライバー連携 / ブロック→解除。
  // 各イベントは best-effort（失敗してもLINEへは200を返す）。低頻度のため同期処理。
  try {
    await handleWebhookEvents(payload.events ?? []);
  } catch (e) {
    console.error("[line] webhook処理エラー（200は返す）", e);
  }

  return NextResponse.json({ success: true });
}
