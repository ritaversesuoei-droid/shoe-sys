import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { RestTimer } from "@/components/driver/RestTimer";

export const dynamic = "force-dynamic";

/** 休憩打刻＋30分タイマー（② 現場要望 / S-02系） */
export default async function RestPage() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");
  return <RestTimer />;
}
