import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

function intervalToMin(v: string | null): number {
  if (!v) return 0;
  const m = /^(\d+):(\d{2})/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
const hm = (t: string | null): string => (t ? t.slice(0, 5) : "");

/**
 * 勤怠修正の書き戻しペイロード。指定月で「修正あり(edited)」の shift を対象に、
 * shift_log シートの該当行（ドライバー名＋開始日で一致）へ 修正出勤/修正退勤/休憩時間/修正理由 を上書き更新させる。
 * GAS 側は op=shift_update を受け、updates を1件ずつ照合して該当セルだけ更新する（全行置換はしない）。
 */
export async function buildAttendanceWriteback(
  sb: SB,
  monthKey: string,
): Promise<{ op: "shift_update"; updates: Record<string, string>[] }> {
  const { data, error } = await sb
    .from("shifts")
    .select("work_date, edited_in, edited_out, rest_time, revision_reason, revision_status, drivers(name)")
    .eq("month_key", monthKey)
    .eq("revision_status", "edited");
  if (error) throw error;

  const updates = (data ?? [])
    .map((s) => {
      const name = (s.drivers as { name: string } | null)?.name ?? "";
      if (!name || !s.work_date) return null;
      // 値が有る項目だけ送る。空文字/0を常に送ると、片側だけ修正した際にシート手入力セルを
      //   空/0で上書き消去してしまう（GAS は updates に在るキーのみ該当セルを更新する前提）。
      const u: Record<string, string> = { driver: name, work_date: s.work_date }; // work_date=yyyy-MM-dd（開始日と照合）
      const ein = hm(s.edited_in);
      if (ein) u.edited_in = ein;
      const eout = hm(s.edited_out);
      if (eout) u.edited_out = eout;
      if (s.rest_time != null) {
        const rm = intervalToMin(s.rest_time);
        u.rest = `${Math.floor(rm / 60)}:${String(rm % 60).padStart(2, "0")}`; // 休憩(H:MM)
      }
      if (s.revision_reason) u.reason = s.revision_reason;
      return u;
    })
    .filter((v): v is Record<string, string> => v !== null);

  return { op: "shift_update", updates };
}
