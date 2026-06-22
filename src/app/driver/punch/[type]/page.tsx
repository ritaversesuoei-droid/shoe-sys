import { redirect, notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
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

  return <PunchForm type={type as ValidType} />;
}
