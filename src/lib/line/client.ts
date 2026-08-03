import "server-only";

import { messagingApi, type messagingApi as MA } from "@line/bot-sdk";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { to_month_key } from "@/lib/datekey";

/**
 * LINE Messaging API クライアント（管理者向け push / ドライバー通知 / 一斉配信 / 仕様書 F-16）。
 * トークンは環境変数のみ（仕様書 12.1-#1）。送信は一時エラー時に指数バックオフで再送する。
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

/** 一時エラー（429/5xx/ネットワーク）だけ指数バックオフで再送する。 */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const err = e as { statusCode?: number; status?: number };
      const status = err?.statusCode ?? err?.status;
      const retryable = status == null || status === 429 || (status >= 500 && status < 600);
      if (!retryable || i === attempts - 1) break;
      const waitMs = 400 * 2 ** i; // 400 → 800 → 1600ms
      console.warn(`[line] ${label} 再送 ${i + 1}/${attempts - 1}（${waitMs}ms後 status=${status ?? "?"}）`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** 月次使用量(line_usage)を加算（F-20 / 12.2-#6）。service_role で RLS バイパス。 */
async function countUsage(delta: number): Promise<void> {
  if (delta <= 0) return;
  const admin = createAdminClient();
  await admin.rpc("increment_line_usage", { p_month_key: to_month_key(new Date()), p_delta: delta });
}

/** 任意の宛先（ユーザー/グループ）へ push（再送＋使用量カウント）。 */
export async function pushTo(to: string, messages: MA.Message[]): Promise<void> {
  const client = getMessagingClient();
  await withRetry(() => client.pushMessage({ to, messages }), `push(${to.slice(0, 6)}…)`);
  await countUsage(messages.length);
}

/**
 * 管理者へ push 送信（宛先未指定時は LINE_ADMIN_TARGET_ID）。
 * @param messages 送信するメッセージ（Flex 等）
 * @param to 宛先。未指定時は LINE_ADMIN_TARGET_ID。
 */
export async function pushToAdmin(messages: MA.Message[], to?: string): Promise<void> {
  const target = to ?? getServerEnv().LINE_ADMIN_TARGET_ID;
  if (!target) throw new Error("送信先(LINE_ADMIN_TARGET_ID)が未設定です");
  await pushTo(target, messages);
}

/**
 * 複数ユーザーへ一斉配信（multicast。1回500件まで自動分割・再送＋使用量カウント）。
 * @returns 実際に送った宛先数
 */
export async function multicastTo(userIds: string[], messages: MA.Message[]): Promise<number> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  if (uniq.length === 0) return 0;
  const client = getMessagingClient();
  let sent = 0;
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    await withRetry(() => client.multicast({ to: chunk, messages }), `multicast(${chunk.length})`);
    await countUsage(chunk.length * messages.length); // 1人1通としてカウント
    sent += chunk.length;
  }
  return sent;
}

/** Webhook 応答（replyToken で返信 / 仕様書 8.3）。返信は push 枠を消費しない。 */
export async function replyMessage(replyToken: string, messages: MA.Message[]): Promise<void> {
  const client = getMessagingClient();
  await withRetry(() => client.replyMessage({ replyToken, messages }), "reply");
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
