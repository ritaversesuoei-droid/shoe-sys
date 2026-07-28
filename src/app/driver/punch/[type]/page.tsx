import { redirect, notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PunchForm } from "@/components/driver/PunchForm";

export const dynamic = "force-dynamic";

const VALID = [
  "departure",
  "leg_departure",
  "arrival",
  "loading",
  "unloading",
  "long_rest",
  "clock_out",
] as const;

type ValidType = (typeof VALID)[number];

export default async function PunchPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");

  const { type } = await params;
  if (!VALID.includes(type as ValidType)) notFound();

  // 車番はドライバーの割当（default_vehicle_no）で確定。ドライバーは入力しない（表示のみ）。
  const supabase = await createClient();
  const { data: drv } = await supabase
    .from("drivers")
    .select("default_vehicle_no")
    .eq("id", ctx.driverId)
    .maybeSingle();

  return <PunchForm type={type as ValidType} driverId={ctx.driverId} vehicleNo={drv?.default_vehicle_no ?? null} />;
}
