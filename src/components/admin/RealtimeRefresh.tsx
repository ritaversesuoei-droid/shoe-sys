"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 運行盤面の即時反映（仕様書 F-15 / 13章E: Supabase Realtime）。
 * events テーブルの変更を購読し、変化があれば Server Component を再取得する。
 */
export function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "compliance_alerts" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
