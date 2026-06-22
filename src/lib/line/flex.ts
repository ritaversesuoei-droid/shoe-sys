import type { messagingApi as MA } from "@line/bot-sdk";

/**
 * 業務報告通知 Flex（仕様書 F-16: 積込・荷卸時に管理者へ push）。
 * カルーセル要素: 氏名・数量・重量・伝票・確認・場所・写真・地図。
 * ※スケルトン。実データ連携時に items/写真URL/地図URLを差し込む。
 */
export function buildReportFlex(params: {
  driverName: string;
  title: string; // 例: 積込完了 / 荷卸完了
  vehicleNo?: string | null;
  place?: string | null;
  lines: { label: string; value: string }[];
  photoUrl?: string | null; // 署名付きURL
  mapUrl?: string | null;
}): MA.FlexMessage {
  const bodyContents: MA.FlexComponent[] = [
    { type: "text", text: params.title, weight: "bold", size: "lg" },
    {
      type: "text",
      text: `${params.driverName}${params.vehicleNo ? ` / ${params.vehicleNo}` : ""}`,
      size: "sm",
      color: "#64748b",
    },
    { type: "separator", margin: "md" },
    ...params.lines.map(
      (l): MA.FlexComponent => ({
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          { type: "text", text: l.label, size: "sm", color: "#64748b", flex: 2 },
          { type: "text", text: l.value || "-", size: "sm", flex: 5, wrap: true },
        ],
      }),
    ),
  ];
  if (params.place) {
    bodyContents.push({
      type: "text",
      text: `📍 ${params.place}`,
      size: "sm",
      wrap: true,
      margin: "md",
    });
  }

  const bubble: MA.FlexBubble = {
    type: "bubble",
    ...(params.photoUrl
      ? { hero: { type: "image", url: params.photoUrl, size: "full", aspectMode: "cover", aspectRatio: "20:13" } }
      : {}),
    body: { type: "box", layout: "vertical", spacing: "sm", contents: bodyContents },
    ...(params.mapUrl
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "link",
                action: { type: "uri", label: "地図を開く", uri: params.mapUrl },
              },
            ],
          },
        }
      : {}),
  };

  return { type: "flex", altText: `${params.title}（${params.driverName}）`, contents: bubble };
}

/**
 * 業務警告通知 Flex（仕様書 F-16: 改善基準告示の違反検知時）。
 * 黄色背景・対象者・違反内容・該当時間。
 */
export function buildWarningFlex(params: {
  driverName: string;
  workDate: string;
  violations: { message: string }[];
}): MA.FlexMessage {
  const bubble: MA.FlexBubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#fef3c7",
      spacing: "sm",
      contents: [
        { type: "text", text: "⚠ 改善基準告示 警告", weight: "bold", size: "lg", color: "#92400e" },
        { type: "text", text: `${params.driverName} / ${params.workDate}`, size: "sm", color: "#78350f" },
        { type: "separator", margin: "md", color: "#fcd34d" },
        ...params.violations.map(
          (v): MA.FlexComponent => ({
            type: "text",
            text: `・${v.message}`,
            size: "sm",
            wrap: true,
            color: "#78350f",
          }),
        ),
      ],
    },
  };
  return { type: "flex", altText: `警告: ${params.driverName} ${params.workDate}`, contents: bubble };
}
