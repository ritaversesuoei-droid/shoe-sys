import "server-only";

import type { messagingApi as MA } from "@line/bot-sdk";
import { pushToAdmin, pushTo } from "./client";
import { buildReportFlex, buildWarningFlex } from "./flex";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PunchItem } from "@/lib/operations/punch";

/**
 * LINE通知（仕様書 F-16）。トークン/宛先が未設定（またはプレースホルダ）の場合は送らない。
 */
export function isPlaceholder(v?: string): boolean {
  return !v || v.startsWith("your-");
}
export function isLineConfigured(): boolean {
  const e = getServerEnv();
  return !isPlaceholder(e.LINE_CHANNEL_ACCESS_TOKEN) && !isPlaceholder(e.LINE_ADMIN_TARGET_ID);
}

/**
 * Webhook 返信（reply）はアクセストークンだけで可能（宛先ID不要）。
 * 宛先ID(LINE_ADMIN_TARGET_ID)が未設定の「設定作業中」でも、グループID案内などを返せるようにする。
 */
export function isReplyConfigured(): boolean {
  const e = getServerEnv();
  return !isPlaceholder(e.LINE_CHANNEL_ACCESS_TOKEN);
}

const TITLE: Record<string, string> = {
  loading: "積込完了",
  unloading: "荷卸完了",
};

/** 業務報告通知（積込・荷卸 / F-16: 到着・出退勤は除く）。 */
export async function notifyBusinessReport(p: {
  driverName: string;
  eventType: string;
  vehicleNo?: string | null;
  place?: string | null;
  lat?: number | null;
  lng?: number | null;
  items?: PunchItem[];
  photoUrl?: string | null; // 荷姿等の写真（署名付きURL・1枚目）
}): Promise<void> {
  const items = p.items ?? [];
  const lines =
    p.eventType === "loading"
      ? items.flatMap((it, i) => [
          { label: `${i + 1}. 荷主`, value: it.shipper ?? "-" },
          { label: "着荷地", value: it.delivery_spot ?? "-" },
          {
            label: "数量/重量",
            value: [it.quantity, it.weight].filter(Boolean).join(" / ") || "-",
          },
          { label: "伝票", value: it.slip_no ?? "-" },
        ])
      : items.flatMap((it, i) => [
          { label: `${i + 1}. 品種`, value: it.cargo_type ?? "-" },
          { label: "受領書", value: it.receipts ?? "-" },
        ]);

  const flex = buildReportFlex({
    driverName: p.driverName,
    title: TITLE[p.eventType] ?? "業務報告",
    vehicleNo: p.vehicleNo,
    place: p.place,
    lines: lines.length ? lines : [{ label: "内容", value: "（明細なし）" }],
    photoUrl: p.photoUrl ?? null,
    mapUrl:
      p.lat != null && p.lng != null
        ? `https://www.google.com/maps?q=${p.lat},${p.lng}`
        : null,
  });
  await pushToAdmin([flex]);
}

/** 業務警告通知（改善基準告示の違反検知 / F-16）。 */
export async function notifyWarning(p: {
  driverName: string;
  workDate: string;
  violations: { message: string }[];
}): Promise<void> {
  if (!p.violations.length) return;
  const flex = buildWarningFlex({
    driverName: p.driverName,
    workDate: p.workDate,
    violations: p.violations,
  });
  await pushToAdmin([flex]);
}

/** 管理者グループへ短文アラート（他通知の失敗周知など）。best-effort（未設定/失敗は握りつぶす）。 */
export async function adminAlert(text: string): Promise<void> {
  if (!isLineConfigured()) return;
  try {
    await pushToAdmin([{ type: "text", text }]);
  } catch (e) {
    console.error("[line] adminAlert失敗", e instanceof Error ? e.message : e);
  }
}

/**
 * ドライバー本人へ通知（line_user_id 連携済みのみ）。未連携/トークン無しは false。
 * 送信失敗時は管理者グループへアラートして false（打刻等の主処理は止めない）。
 */
export async function pushToDriver(
  driverId: string,
  messages: MA.Message[],
  label = "通知",
): Promise<boolean> {
  if (!isReplyConfigured()) return false; // トークン未設定
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("drivers")
    .select("name, line_user_id")
    .eq("id", driverId)
    .maybeSingle();
  if (!d?.line_user_id) return false; // 未連携はスキップ
  try {
    await pushTo(d.line_user_id, messages);
    return true;
  } catch (e) {
    console.error("[line] driver通知失敗", e instanceof Error ? e.message : e);
    await adminAlert(`⚠ ${d.name} さんへのLINE通知に失敗しました（${label}）`);
    return false;
  }
}

/** ドライバー本人へ改善基準告示の違反を通知（F-16 拡張: 本人フィードバック）。 */
export async function notifyDriverViolation(p: {
  driverId: string;
  driverName: string;
  workDate: string;
  violations: { message: string }[];
}): Promise<boolean> {
  if (!p.violations.length) return false;
  const flex = buildWarningFlex({
    driverName: p.driverName,
    workDate: p.workDate,
    violations: p.violations,
  });
  return pushToDriver(p.driverId, [flex], "違反警告");
}
