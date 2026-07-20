import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";

/**
 * GET /api/admin/warnings?month=yyyyMM&status=open|resolved  警告一覧（仕様書 F-13, 8.1）
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const status = url.searchParams.get("status");

    const supabase = await createClient();
    let query = supabase
      .from("compliance_alerts")
      .select("*, drivers(code, name)")
      .order("work_date", { ascending: false });
    if (month) query = query.eq("month_key", month);
    if (status === "open" || status === "resolved") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    const alerts = data ?? [];
    if (alerts.length === 0) return ok({ warnings: [] });

    // ③(5) 前日退勤・当日出勤・当日退勤の時刻を付与
    const shiftIds = [...new Set(alerts.map((a) => a.shift_id).filter(Boolean))] as string[];
    const driverIds = [...new Set(alerts.map((a) => a.driver_id))];
    const { data: shifts } = await supabase
      .from("shifts")
      .select("id, clock_in_at, clock_out_at")
      .in("id", shiftIds);
    const shiftMap = new Map((shifts ?? []).map((s) => [s.id, s]));
    const { data: closed } = await supabase
      .from("shifts")
      .select("driver_id, clock_out_at")
      .in("driver_id", driverIds)
      .not("clock_out_at", "is", null)
      .order("clock_out_at", { ascending: true });
    const byDriver = new Map<string, string[]>();
    for (const s of closed ?? []) {
      const arr = byDriver.get(s.driver_id) ?? [];
      arr.push(s.clock_out_at as string);
      byDriver.set(s.driver_id, arr);
    }

    const warnings = alerts.map((a) => {
      const sh = a.shift_id ? shiftMap.get(a.shift_id) : null;
      const clockIn = sh?.clock_in_at ?? null;
      let prevClockOut: string | null = null;
      if (clockIn) {
        for (const co of byDriver.get(a.driver_id) ?? []) {
          if (co < clockIn) prevClockOut = co;
          else break;
        }
      }
      return { ...a, clock_in: clockIn, clock_out: sh?.clock_out_at ?? null, prev_clock_out: prevClockOut };
    });
    return ok({ warnings });
  });
}
