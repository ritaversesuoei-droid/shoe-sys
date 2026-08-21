import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "昭栄運輸 運行・勤怠管理システム",
  description: "運行打刻・勤怠自動集計・改善基準告示判定・帳票出力",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // スマホで管理画面の表を拡大して読めるようにズームを許可（ドライバー画面は driver/layout で無効化）
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
