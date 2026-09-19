import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { toWorkDate } from "@/lib/datekey";

type SB = SupabaseClient<Database>;

/**
 * 出勤指示時間（早すぎ出勤の同意ゲート / 現場要望 2026-09-19）。
 *   - 管理者が「日別×ドライバー別」に出勤指示時間(HH:MM, JST)を設定。
 *   - ドライバーの通常出勤打刻時、現在時刻が指示時間(−猶予)より前ならアラート＋同意を要求。
 *
 * 保存先は app_settings（JSONB）。dispatch_plans はシート同期で plan_date 単位に delete→insert
 * されるため列を足すと消える。指示時間は別キーで持ち、同期の影響を受けないようにする。
 *   key='attendance_instructions' value={ `${driverId}|${yyyy-mm-dd}`: 'HH:MM' }
 *   key='attendance'             value={ early_departure_grace_min: number }（猶予・既定0）
 */

const KEY_INSTRUCTIONS = "attendance_instructions";
const KEY_ATTENDANCE = "attendance";
const DEFAULT_GRACE_MIN = 0;
// マップ肥大防止: 保存時にこの日数より古い指示を剪定（指示は先読み運用のため過去は不要）。
const PRUNE_BEFORE_DAYS = 14;

export function instructionKey(driverId: string, workDate: string): string {
  return `${driverId}|${workDate}`;
}

/** "HH:MM" を正規化（"8:0"→"08:00"）。不正/範囲外は null。 */
export function normalizeHhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

async function readMap(sb: SB): Promise<Record<string, string>> {
  const { data } = await sb.from("app_settings").select("value").eq("key", KEY_INSTRUCTIONS).maybeSingle();
  return (data?.value as Record<string, string> | null) ?? {};
}

/** 指定ドライバー・日付の出勤指示時間（HH:MM）。無ければ null。 */
export async function getInstructionTime(sb: SB, driverId: string, workDate: string): Promise<string | null> {
  const map = await readMap(sb);
  return normalizeHhmm(map[instructionKey(driverId, workDate)] ?? null);
}

/** 指定日の全ドライバーの出勤指示時間（driverId → HH:MM）。管理画面用。 */
export async function getInstructionsForDate(sb: SB, workDate: string): Promise<Record<string, string>> {
  const map = await readMap(sb);
  const out: Record<string, string> = {};
  const suffix = `|${workDate}`;
  for (const [k, v] of Object.entries(map)) {
    if (k.endsWith(suffix)) {
      const driverId = k.slice(0, k.length - suffix.length);
      const hhmm = normalizeHhmm(v);
      if (driverId && hhmm) out[driverId] = hhmm;
    }
  }
  return out;
}

/** 出勤指示時間を設定（hhmm=null/不正 で解除）。古い日付は剪定して保存。 */
export async function setInstructionTime(
  sb: SB,
  driverId: string,
  workDate: string,
  hhmm: string | null,
): Promise<void> {
  const map = await readMap(sb);
  const key = instructionKey(driverId, workDate);
  const norm = normalizeHhmm(hhmm);
  if (norm) map[key] = norm;
  else delete map[key];

  // 剪定: 古い日付を落としてマップ肥大化を防ぐ
  const cutoff = toWorkDate(new Date(Date.now() - PRUNE_BEFORE_DAYS * 86_400_000));
  for (const k of Object.keys(map)) {
    const d = k.split("|")[1];
    if (d && d < cutoff) delete map[k];
  }

  const { error } = await sb
    .from("app_settings")
    .upsert(
      {
        key: KEY_INSTRUCTIONS,
        value: map as unknown as Json,
        description: "出勤指示時間（driverId|yyyy-mm-dd → HH:MM, JST）",
      },
      { onConflict: "key" },
    );
  if (error) throw error;
}

/**
 * 複数ドライバーへ同一の出勤指示時間を一括設定（hhmm=null/空 で一括解除）。
 *   1回の読み書きでまとめて反映（PATCHをN回叩くより速い）。古い日付は剪定。
 */
export async function setInstructionTimesBulk(
  sb: SB,
  workDate: string,
  driverIds: string[],
  hhmm: string | null,
): Promise<{ count: number; time: string | null }> {
  const map = await readMap(sb);
  const norm = normalizeHhmm(hhmm);
  let count = 0;
  for (const driverId of driverIds) {
    if (!driverId) continue;
    const key = instructionKey(driverId, workDate);
    if (norm) map[key] = norm;
    else delete map[key];
    count++;
  }

  // 剪定: 古い日付を落としてマップ肥大化を防ぐ
  const cutoff = toWorkDate(new Date(Date.now() - PRUNE_BEFORE_DAYS * 86_400_000));
  for (const k of Object.keys(map)) {
    const d = k.split("|")[1];
    if (d && d < cutoff) delete map[k];
  }

  const { error } = await sb
    .from("app_settings")
    .upsert(
      {
        key: KEY_INSTRUCTIONS,
        value: map as unknown as Json,
        description: "出勤指示時間（driverId|yyyy-mm-dd → HH:MM, JST）",
      },
      { onConflict: "key" },
    );
  if (error) throw error;
  return { count, time: norm };
}

/** 早すぎ判定の猶予（分）。app_settings('attendance').early_departure_grace_min（既定0）。 */
export async function getEarlyGraceMin(sb: SB): Promise<number> {
  const { data } = await sb.from("app_settings").select("value").eq("key", KEY_ATTENDANCE).maybeSingle();
  const v = (data?.value as { early_departure_grace_min?: number } | null)?.early_departure_grace_min;
  return typeof v === "number" && v >= 0 && v <= 1440 ? v : DEFAULT_GRACE_MIN;
}

/**
 * 出勤指示時間より早い出勤か（JST統一・epoch演算）。
 *   instructionTime='HH:MM'(JST) を workDate(JST暦日) の時刻に合成し、now と比較。graceMin分の猶予を許容。
 *   指示時間が無い/不正なら常に false（アラートなし）。
 */
export function isEarlyDeparture(
  nowIso: string,
  workDate: string,
  instructionTime: string | null,
  graceMin: number,
): boolean {
  const hhmm = normalizeHhmm(instructionTime);
  if (!hhmm) return false;
  // hhmm は正規化済み "HH:MM"（5文字）
  const h = Number(hhmm.slice(0, 2));
  const mi = Number(hhmm.slice(3, 5));
  // workDate の JST 壁時計 hh:mm を UTC epoch へ（JST = UTC+9h ⇒ UTC = JST−9h）
  const instructedUtcMs =
    Date.parse(`${workDate}T00:00:00Z`) - 9 * 3600_000 + (h * 60 + mi) * 60_000;
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) return false;
  return nowMs < instructedUtcMs - graceMin * 60_000;
}
