import { getSessionContext } from "@/lib/auth";
import { DriverLogin } from "@/components/driver/DriverLogin";
import { DriverMenu } from "@/components/driver/DriverMenu";

export const dynamic = "force-dynamic";

/**
 * ドライバーメニュー（S-02 / 現行GAS index画面の再現）。未ログインはログイン画面。
 * レイアウト・配色・選択ダイアログは DriverMenu（クライアント）が担う。
 * 休憩ボタンは常時表示（通常休憩＋長距離休息を1つに集約・現場要望 2026-09-19）。
 */
export default async function DriverHome() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) return <DriverLogin />;

  return <DriverMenu name={ctx.displayName ?? "ドライバー"} />;
}
