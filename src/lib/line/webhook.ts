import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { replyMessage } from "./client";
import { isLineConfigured } from "./notify";

/** LINE Webhook イベント（必要フィールドのみ）。 */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
}

const FOLLOW_GUIDE =
  "昭栄運輸 勤怠システムへようこそ。\n" +
  "ドライバー番号（数字）をこのトークに送信すると、アカウントを連携します。\n" +
  "例: 12\n※番号が不明な場合は事務所にお問い合わせください。";

/** 返信（best-effort。LINE未設定/トークン無しなら何もしない）。 */
async function reply(ev: LineWebhookEvent, text: string): Promise<void> {
  if (!ev.replyToken || !isLineConfigured()) return;
  try {
    await replyMessage(ev.replyToken, [{ type: "text", text }]);
  } catch (e) {
    console.warn("[line] reply失敗:", e instanceof Error ? e.message : e);
  }
}

/** 友だち追加 → 連携案内。 */
async function onFollow(ev: LineWebhookEvent): Promise<void> {
  await reply(ev, FOLLOW_GUIDE);
}

/** テキスト受信 → ドライバー番号なら連携、それ以外は案内。 */
async function onTextMessage(ev: LineWebhookEvent): Promise<void> {
  const text = (ev.message?.text ?? "").trim();
  const userId = ev.source?.userId;
  const m = /^0*(\d{1,3})$/.exec(text);
  if (!m || !userId) {
    await reply(ev, FOLLOW_GUIDE);
    return;
  }

  const admin = createAdminClient();
  // 入力番号は前ゼロ揺れを許容（"01"も"1"もマッチ）
  const { data: drivers } = await admin.from("drivers").select("id, name, code, line_user_id").eq("is_active", true);
  const target = (drivers ?? []).find((d) => d.code != null && Number(d.code) === Number(m[1]));
  if (!target) {
    await reply(ev, `ドライバー番号「${text}」が見つかりません。番号をご確認ください。`);
    return;
  }

  // 既に別ユーザーへ連携済みなら上書き（端末変更を許容）。同一userIdの他連携は解除。
  await admin.from("drivers").update({ line_user_id: null }).eq("line_user_id", userId).neq("id", target.id);
  const { error } = await admin.from("drivers").update({ line_user_id: userId }).eq("id", target.id);
  if (error) {
    console.error("[line] 連携更新失敗:", error.message);
    await reply(ev, "連携に失敗しました。時間をおいて再度お試しください。");
    return;
  }
  await reply(ev, `${target.name} さんとして連携しました。お疲れさまです。`);
}

/** ブロック（unfollow）→ 連携解除（監査のため driver 自体は残す）。 */
async function onUnfollow(ev: LineWebhookEvent): Promise<void> {
  const userId = ev.source?.userId;
  if (!userId) return;
  const admin = createAdminClient();
  await admin.from("drivers").update({ line_user_id: null }).eq("line_user_id", userId);
}

/**
 * Webhook イベント列を処理（友だち追加→連携案内 / 番号送信→連携 / ブロック→解除）。
 * 各イベントは独立に best-effort 処理（1件の失敗で他を止めない）。
 */
export async function handleWebhookEvents(events: LineWebhookEvent[]): Promise<void> {
  for (const ev of events) {
    try {
      if (ev.type === "follow") await onFollow(ev);
      else if (ev.type === "message" && ev.message?.type === "text") await onTextMessage(ev);
      else if (ev.type === "unfollow") await onUnfollow(ev);
    } catch (e) {
      console.error("[line] webhookイベント処理失敗:", e instanceof Error ? e.message : e);
    }
  }
}
