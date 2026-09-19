import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { RestTimer } from "@/components/driver/RestTimer";

export const dynamic = "force-dynamic";

/** 休憩打刻タイマー（② 現場要望 / S-02系）。mode=split で分割休息（原則3時間）。 */
export default async function RestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");
  const { mode } = await searchParams;
  return <RestTimer mode={mode === "split" ? "split" : "normal"} />;
}
