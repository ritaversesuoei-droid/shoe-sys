import "server-only";

import { pushToAdmin } from "./client";
import { buildReportFlex, buildWarningFlex } from "./flex";
import { getServerEnv } from "@/lib/env";
import type { PunchItem } from "@/lib/operations/punch";

/**
 * LINE通知（仕様書 F-16）。トークン/宛先が未設定（またはプレースホルダ）の場合は送らない。
 */
function isPlaceholder(v?: string): boolean {
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
