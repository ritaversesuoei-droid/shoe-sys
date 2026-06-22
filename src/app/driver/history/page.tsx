import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { TodayHistory } from "@/components/driver/TodayHistory";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");
  return <TodayHistory />;
}
