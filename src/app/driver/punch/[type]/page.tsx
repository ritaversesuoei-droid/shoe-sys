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
    .select("name, default_vehicle_no")
    .eq("id", ctx.driverId)
    .maybeSingle();

  // 荷卸: 直近の積込完了の着荷地を「荷卸し対象」として提示（現行GAS getLatestLoadingAndMatch 相当）
  let unloadTargets: string[] = [];
  if (type === "unloading") {
    const { data: lastLoad } = await supabase
      .from("events")
      .select("event_items(delivery_spot)")
      .eq("driver_id", ctx.driverId)
      .eq("event_type", "loading")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const items = (lastLoad?.event_items ?? []) as { delivery_spot: string | null }[];
    unloadTargets = [
      ...new Set(
        items
          .flatMap((it) => (it.delivery_spot ?? "").split(/[\n、,]/))
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }

  return (
    <PunchForm
      type={type as ValidType}
      driverId={ctx.driverId}
      driverName={drv?.name ?? null}
      vehicleNo={drv?.default_vehicle_no ?? null}
      unloadTargets={unloadTargets}
    />
  );
}
