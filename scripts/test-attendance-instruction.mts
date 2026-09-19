/**
 * 出勤指示時間（早すぎ出勤の同意ゲート）テスト。
 * 実行: npm run test:attendance-instruction
 *   - 純ロジック（isEarlyDeparture / normalizeHhmm）を検証。
 *   - app_settings への set/get/剪定 を実DBで検証（実行前後で該当キーをバックアップ→復元）。
 * 注意: app_settings('attendance_instructions'/'attendance') を一時的に書き換え、終了時に元へ復元します。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database, Json } from "@/types/database";
import {
  normalizeHhmm,
  isEarlyDeparture,
  setInstructionTime,
  getInstructionTime,
  getInstructionsForDate,
  getEarlyGraceMin,
} from "@/lib/operations/attendance-instruction";
import { toWorkDate } from "@/lib/datekey";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const sb = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

const KEYS = ["attendance_instructions", "attendance"] as const;

async function backup(): Promise<Map<string, Json | null>> {
  const map = new Map<string, Json | null>();
  const { data } = await sb.from("app_settings").select("key, value").in("key", KEYS as unknown as string[]);
  for (const k of KEYS) map.set(k, (data ?? []).find((r) => r.key === k)?.value ?? null);
  return map;
}
async function restore(bk: Map<string, Json | null>) {
  for (const k of KEYS) {
    const v = bk.get(k) ?? null;
    if (v === null) {
      await sb.from("app_settings").delete().eq("key", k);
    } else {
      await sb.from("app_settings").upsert({ key: k, value: v }, { onConflict: "key" });
    }
  }
}

async function main() {
  console.log("\n[純ロジック] normalizeHhmm");
  check('"8:0" → "08:00"', normalizeHhmm("8:0") === "08:00");
  check('"08:00" → "08:00"', normalizeHhmm("08:00") === "08:00");
  check('"23:59" → "23:59"', normalizeHhmm("23:59") === "23:59");
  check('"24:00" → null', normalizeHhmm("24:00") === null);
  check('"9:60" → null', normalizeHhmm("9:60") === null);
  check('"" → null', normalizeHhmm("") === null);
  check('"abc" → null', normalizeHhmm("abc") === null);

  console.log("\n[純ロジック] isEarlyDeparture（JST・猶予0）");
  const wd = "2026-09-20";
  // 指示 08:00(JST) = 2026-09-19T23:00:00Z
  check("07:59(JST)は早い", isEarlyDeparture("2026-09-19T22:59:00Z", wd, "08:00", 0) === true);
  check("08:00(JST)ちょうどは早くない", isEarlyDeparture("2026-09-19T23:00:00Z", wd, "08:00", 0) === false);
  check("08:01(JST)は早くない", isEarlyDeparture("2026-09-19T23:01:00Z", wd, "08:00", 0) === false);
  check("指示なし(null)は常に早くない", isEarlyDeparture("2026-09-19T00:00:00Z", wd, null, 0) === false);

  console.log("\n[純ロジック] isEarlyDeparture（猶予15分）");
  // 猶予15分 → 07:45より前だけアラート
  check("07:44(JST)は早い(猶予15)", isEarlyDeparture("2026-09-19T22:44:00Z", wd, "08:00", 15) === true);
  check("07:45(JST)は早くない(猶予15)", isEarlyDeparture("2026-09-19T22:45:00Z", wd, "08:00", 15) === false);
  check("07:50(JST)は早くない(猶予15)", isEarlyDeparture("2026-09-19T22:50:00Z", wd, "08:00", 15) === false);

  const bk = await backup();
  try {
    console.log("\n[実DB] set/get/一覧/剪定（app_settings）");
    const d1 = new Set<string>();
    const drvA = randomUUID();
    const drvB = randomUUID();
    const today = toWorkDate(new Date());
    d1.add(today);

    await setInstructionTime(sb, drvA, today, "8:0"); // 正規化される
    await setInstructionTime(sb, drvB, today, "09:30");
    check("getで drvA=08:00", (await getInstructionTime(sb, drvA, today)) === "08:00");
    check("getで drvB=09:30", (await getInstructionTime(sb, drvB, today)) === "09:30");

    const forDate = await getInstructionsForDate(sb, today);
    check("一覧に drvA/drvB を含む", forDate[drvA] === "08:00" && forDate[drvB] === "09:30", forDate);

    await setInstructionTime(sb, drvA, today, null); // 解除
    check("解除で drvA=null", (await getInstructionTime(sb, drvA, today)) === null);
    check("drvB は残る", (await getInstructionTime(sb, drvB, today)) === "09:30");

    // 剪定: 30日前の指示は保存時に落ちる（14日剪定）
    const old = toWorkDate(new Date(Date.now() - 30 * 86_400_000));
    await setInstructionTime(sb, drvB, old, "07:00");
    check("30日前は剪定され null", (await getInstructionTime(sb, drvB, old)) === null);
    check("当日分は剪定後も残る", (await getInstructionTime(sb, drvB, today)) === "09:30");

    console.log("\n[実DB] 猶予の読み取り（未設定=0）");
    await sb.from("app_settings").delete().eq("key", "attendance");
    check("未設定は0", (await getEarlyGraceMin(sb)) === 0);
    await sb.from("app_settings").upsert({ key: "attendance", value: { early_departure_grace_min: 20 } as unknown as Json }, { onConflict: "key" });
    check("設定値20を読む", (await getEarlyGraceMin(sb)) === 20);
    await sb.from("app_settings").upsert({ key: "attendance", value: { early_departure_grace_min: 9999 } as unknown as Json }, { onConflict: "key" });
    check("範囲外(9999)は既定0にフォールバック", (await getEarlyGraceMin(sb)) === 0);
  } finally {
    await restore(bk);
  }
}

main()
  .catch((e) => {
    fail++;
    console.error("実行エラー:", e);
  })
  .finally(() => {
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
