"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 配車表の即時反映。dispatch_plans の変更を Supabase Realtime で購読して再取得。
 * Realtime 未設定でも 20 秒ごとのポーリングで自動更新するフォールバック付き。
 */
export function DispatchRealtime() {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("dispatch-plans")
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_plans" }, () => router.refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const iv = setInterval(() => router.refresh(), 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} />
      {live ? "自動反映中（即時）" : "自動更新中"}
    </span>
  );
}
