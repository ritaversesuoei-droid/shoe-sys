import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

/**
 * 配車/流れ表の「確定」状態（日付単位）。app_settings('dispatch_confirmed').value = { dates: [...] } に保持。
 *   流れ表で確定/解除すると、その日付の配車表・流れ表のタイトル帯が赤くなる（両画面で同期）。
 */
export async function getConfirmedDates(sb: SB): Promise<Set<string>> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "dispatch_confirmed").maybeSingle();
  const dates = (data?.value as { dates?: string[] } | null)?.dates ?? [];
  return new Set(dates);
}

export async function isDispatchConfirmed(sb: SB, date: string): Promise<boolean> {
  return (await getConfirmedDates(sb)).has(date);
}

/** 指定日の確定状態を設定し、更新後の確定日一覧を返す。 */
export async function setDispatchConfirmed(sb: SB, date: string, confirmed: boolean): Promise<string[]> {
  const set = await getConfirmedDates(sb);
  if (confirmed) set.add(date);
  else set.delete(date);
  const dates = [...set].sort();
  const { error } = await sb
    .from("app_settings")
    .upsert({ key: "dispatch_confirmed", value: { dates } }, { onConflict: "key" });
  if (error) throw error;
  return dates;
}
