import "server-only";

import { messagingApi, type messagingApi as MA } from "@line/bot-sdk";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { to_month_key } from "@/lib/datekey";

/**
 * LINE Messaging API クライアント（管理者向け push 用 / 仕様書 F-16）。
 * トークンは環境変数のみ（仕様書 12.1-#1）。
 */
function getMessagingClient() {
  const { LINE_CHANNEL_ACCESS_TOKEN } = getServerEnv();
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  }
  return new messagingApi.MessagingApiClient({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  });
}

/**
 * 管理者へ push 送信し、月次使用量(line_usage)をカウントアップ（仕様書 F-20 / 12.2-#6）。
 * @param messages 送信するメッセージ（Flex 等）
 * @param to 宛先。未指定時は LINE_ADMIN_TARGET_ID。
 */
export async function pushToAdmin(
  messages: MA.Message[],
  to?: string,
): Promise<void> {
  const env = getServerEnv();
  const target = to ?? env.LINE_ADMIN_TARGET_ID;
  if (!target) throw new Error("送信先(LINE_ADMIN_TARGET_ID)が未設定です");

  const client = getMessagingClient();
  await client.pushMessage({ to: target, messages });

  // 使用量カウント（service_role で RLS バイパス）
  const monthKey = to_month_key(new Date());
  const admin = createAdminClient();
  await admin.rpc("increment_line_usage", { p_month_key: monthKey, p_delta: messages.length });
}

/** Webhook 応答（replyToken で返信 / 仕様書 8.3）。トークン未設定なら例外。 */
export async function replyMessage(
  replyToken: string,
  messages: MA.Message[],
): Promise<void> {
  const client = getMessagingClient();
  await client.replyMessage({ replyToken, messages });
}

/** LINE ID トークン検証（LIFF ログイン: ドライバー認証 / 仕様書 F-01）。 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
): Promise<{ sub: string; name?: string } | null> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { sub?: string; name?: string };
  return data.sub ? { sub: data.sub, name: data.name } : null;
}
