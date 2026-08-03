import "server-only";

import { messagingApi } from "@line/bot-sdk";
import { htmlToPng } from "@/lib/pdf/render";

/**
 * ドライバー向けリッチメニュー（公式LINE下部の常設メニュー / F-16 拡張）。
 *   2500×1686 の 3×2 グリッド。各ボタンは LIFF（あれば）or 公開URLの /driver 配下へ遷移。
 *   画像は既存の puppeteer(htmlToPng)で生成し、LINE に登録して既定メニューにする。
 *   ※ LIFF ボタンを正しく機能させるには LIFF エンドポイントURLを `${APP_URL}/driver` に設定すること。
 */
const SIZE = { width: 2500, height: 1686 };
const CELL = { w: 833, h: 843 };

interface Btn {
  label: string;
  icon: string;
  path: string; // /driver からの相対パス
  color: string;
}
const BUTTONS: Btn[] = [
  { label: "出勤", icon: "☀️", path: "/punch/departure", color: "#f59e0b" },
  { label: "到着報告", icon: "📍", path: "/punch/arrival", color: "#0ea5e9" },
  { label: "退勤", icon: "🌙", path: "/punch/clock_out", color: "#475569" },
  { label: "積込完了", icon: "📦", path: "/punch/loading", color: "#10b981" },
  { label: "荷卸完了", icon: "🏗️", path: "/punch/unloading", color: "#8b5cf6" },
  { label: "日報", icon: "📝", path: "/report", color: "#ef4444" },
];

function imageHtml(): string {
  const cells = BUTTONS.map(
    (b) => `
    <div style="width:${CELL.w}px;height:${CELL.h}px;box-sizing:border-box;border:3px solid #ffffff;
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                background:${b.color};color:#ffffff;">
      <div style="font-size:230px;line-height:1;">${b.icon}</div>
      <div style="font-size:130px;font-weight:800;margin-top:24px;">${b.label}</div>
    </div>`,
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;}</style></head>
    <body><div style="width:${SIZE.width}px;height:${SIZE.height}px;display:flex;flex-wrap:wrap;
      font-family:'Hiragino Sans','Noto Sans JP',sans-serif;">${cells}</div></body></html>`;
}

/** リッチメニューを作成し既定に設定する。作成した richMenuId を返す。 */
export async function setupDriverRichMenu(): Promise<{ richMenuId: string; base: string; liff: boolean }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || token.startsWith("your-")) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const base = liffId ? `https://liff.line.me/${liffId}` : appUrl ? `${appUrl}/driver` : "";
  if (!base) throw new Error("NEXT_PUBLIC_LIFF_ID もしくは NEXT_PUBLIC_APP_URL が必要です");

  const png = await htmlToPng(imageHtml(), SIZE);

  const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  const blob = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });

  const areas: messagingApi.RichMenuArea[] = BUTTONS.map((b, i) => ({
    bounds: { x: (i % 3) * CELL.w, y: Math.floor(i / 3) * CELL.h, width: CELL.w, height: CELL.h },
    action: { type: "uri", label: b.label, uri: `${base}${b.path}` },
  }));

  const richMenu: messagingApi.RichMenuRequest = {
    size: SIZE,
    selected: true,
    name: "driver-menu-v1",
    chatBarText: "メニュー",
    areas,
  };

  const { richMenuId } = await client.createRichMenu(richMenu);
  // Blob の BlobPart 型に合わせて ArrayBuffer 化して渡す
  const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  await blob.setRichMenuImage(richMenuId, new Blob([ab], { type: "image/png" }));
  await client.setDefaultRichMenu(richMenuId);
  return { richMenuId, base, liff: !!liffId };
}
