import { NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line/signature";
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

  const payload = JSON.parse(rawBody) as { events?: unknown[] };
  // TODO: payload.events を処理（友だち追加→ドライバー紐付け案内 等）。
  //       重い処理は即時 200 を返してから非同期化する（LINE のタイムアウト対策）。
  void payload;

  return NextResponse.json({ success: true });
}
