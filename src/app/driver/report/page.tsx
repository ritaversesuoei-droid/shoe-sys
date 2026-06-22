import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { DailyReportForm } from "@/components/driver/DailyReportForm";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");
  return <DailyReportForm />;
}
