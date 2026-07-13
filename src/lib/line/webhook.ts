import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { replyMessage } from "./client";
import { isReplyConfigured } from "./notify";

/** LINE Webhook イベント（必要フィールドのみ）。 */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
}

/** イベント発生元のID（グループ/ルーム優先、無ければ個人）。管理者通知の宛先に使える。 */
function sourceId(ev: LineWebhookEvent): string | null {
  return ev.source?.groupId ?? ev.source?.roomId ?? ev.source?.userId ?? null;
}
/** グループ/ルームからのイベントか。 */
function isGroupSource(ev: LineWebhookEvent): boolean {
  return ev.source?.type === "group" || ev.source?.type === "room";
}

const FOLLOW_GUIDE =
  "昭栄運輸 勤怠システムへようこそ。\n" +
  "ドライバー番号（数字）をこのトークに送信すると、アカウントを連携します。\n" +
  "例: 12\n※番号が不明な場合は事務所にお問い合わせください。";

/** 返信（best-effort。LINE未設定/トークン無しなら何もしない）。 */
async function reply(ev: LineWebhookEvent, text: string): Promise<void> {
  if (!ev.replyToken || !isReplyConfigured()) return;
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

/** グループ/ルームに追加された → 管理者通知の宛先に使えるIDを案内（LINE_ADMIN_TARGET_ID 設定用）。 */
async function onJoin(ev: LineWebhookEvent): Promise<void> {
  const id = ev.source?.groupId ?? ev.source?.roomId;
  if (!id) return;
  await reply(
    ev,
    "昭栄運輸 勤怠システムです。\n" +
      "このトークを管理者通知の宛先にできます。\n" +
      `宛先ID: ${id}\n` +
      "（この宛先IDを設定に登録すると、以後ここへ違反警告・業務報告を通知します）",
  );
}

/** テキスト受信 → 「ID」なら発生元ID返信 / 1:1でドライバー番号なら連携 / それ以外は案内。 */
async function onTextMessage(ev: LineWebhookEvent): Promise<void> {
  const text = (ev.message?.text ?? "").trim();

  // 設定支援: 「ID」「宛先」等で発生元IDを返す（管理者通知の宛先取得に使う）。
  if (/^(id|グループid|宛先id|宛先)$/i.test(text)) {
    const id = sourceId(ev);
    await reply(ev, id ? `宛先ID: ${id}` : "IDを取得できませんでした。");
    return;
  }

  // ドライバー番号連携は 1:1 トークのみ（グループでは番号連携も定型案内もしない）。
  if (isGroupSource(ev)) return;

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
      else if (ev.type === "join") await onJoin(ev);
      else if (ev.type === "message" && ev.message?.type === "text") await onTextMessage(ev);
      else if (ev.type === "unfollow") await onUnfollow(ev);
    } catch (e) {
      console.error("[line] webhookイベント処理失敗:", e instanceof Error ? e.message : e);
    }
  }
}
