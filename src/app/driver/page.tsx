import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DriverLogin } from "@/components/driver/DriverLogin";
import { DriverMenu } from "@/components/driver/DriverMenu";

export const dynamic = "force-dynamic";

/**
 * ドライバーメニュー（S-02 / 現行GAS index画面の再現）。未ログインはログイン画面。
 * レイアウト・配色・選択ダイアログは DriverMenu（クライアント）が担う。
 */
export default async function DriverHome() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) return <DriverLogin />;

  // 休憩ボタン自体は常時表示（長距離休憩＝泊まりの休息を含むため）。
  //   「通常休憩」(勤務中タイマー)の選択肢のみ、自社は §6② により既定で非表示（手入力運用）。
  //   協力店社 or 設定(features.rest_button)で有効化時に「通常休憩」も表示する（showRest）。
  const supabase = await createClient();
  const [{ data: drv }, { data: featRow }] = await Promise.all([
    supabase.from("drivers").select("manage_attendance").eq("id", ctx.driverId).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "features").maybeSingle(),
  ]);
  const isOwnCompany = drv?.manage_attendance !== false;
  const restForced = (featRow?.value as { rest_button?: boolean } | null)?.rest_button === true;
  const showRest = restForced || !isOwnCompany;

  return <DriverMenu name={ctx.displayName ?? "ドライバー"} showRest={showRest} />;
}
