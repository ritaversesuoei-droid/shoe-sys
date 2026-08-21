import type { Viewport } from "next";

/** ドライバー打刻画面は誤操作防止のためズーム無効（大きめボタン前提のスマホ最適化UI）。 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
