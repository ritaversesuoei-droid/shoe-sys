import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { holidaysOfYear, type DayClass } from "@/lib/holidays";
import type { Json } from "@/types/database";

/**
 * GET /api/admin/holidays?month=yyyyMM  当月の祝日（算出）＋ 休日区分の手修正一覧（F-14）
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{6}$/.test(month)) return fail("month は yyyyMM 形式", 400);
    const year = Number(month.slice(0, 4));
    const mm = month.slice(4, 6);

    const holidays = Array.from(holidaysOfYear(year).entries())
      .filter(([date]) => date.slice(5, 7) === mm)
      .map(([date, name]) => ({ date, name }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("value").eq("key", "holiday_overrides").maybeSingle();
    const overrides = (data?.value as Record<string, DayClass>) ?? {};
    return ok({ month, holidays, overrides });
  });
}

/**
 * PATCH /api/admin/holidays  休日区分の手修正（→ 月次は再取得で即再計算）
 *   body: { date: 'yyyy-MM-dd', classification: 'holiday' | 'workday' | 'auto' }
 *   'auto' は手修正を解除（土日/祝日の自動判定に戻す）。
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = (await request.json()) as { date?: string; classification?: string };
    const date = body.date ?? "";
    const cls = body.classification ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date は yyyy-MM-dd 形式", 400);
    if (!["holiday", "workday", "auto"].includes(cls)) return fail("classification は holiday/workday/auto", 400);

    const supabase = await createClient();
    const { data: cur } = await supabase.from("app_settings").select("value").eq("key", "holiday_overrides").maybeSingle();
    const overrides = { ...((cur?.value as Record<string, DayClass>) ?? {}) };
    if (cls === "auto") delete overrides[date];
    else overrides[date] = cls as DayClass;

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "holiday_overrides", value: overrides as unknown as Json, description: "休日区分の手修正" },
        { onConflict: "key" },
      );
    if (error) throw error;
    return ok({ overrides });
  });
}
