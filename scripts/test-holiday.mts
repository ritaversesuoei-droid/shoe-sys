/**
 * 祝日エンジン＋月次の休日労働 結合テスト。実行: npm run test:holiday
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isNationalHoliday, holidayName, classifyDay, holidaysOfYear } from "@/lib/holidays";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  console.log("[祝日アルゴリズム 2026]");
  console.log("  " + Array.from(holidaysOfYear(2026).entries()).map(([d, n]) => `${d}:${n}`).join("\n  "));

  console.log("\n[固定・ハッピーマンデー・春分秋分]");
  check("元日 2026-01-01", isNationalHoliday("2026-01-01"));
  check("成人の日 2026-01-12(第2月)", isNationalHoliday("2026-01-12"));
  check("建国記念 2026-02-11", isNationalHoliday("2026-02-11"));
  check("天皇誕生日 2026-02-23", isNationalHoliday("2026-02-23"));
  check("春分の日 2026-03-20", isNationalHoliday("2026-03-20"));
  check("こどもの日 2026-05-05", isNationalHoliday("2026-05-05"));
  check("海の日 2026-07-20(第3月)", isNationalHoliday("2026-07-20"));
  check("敬老の日 2026-09-21(第3月)", isNationalHoliday("2026-09-21"));
  check("秋分の日 2026-09-23", isNationalHoliday("2026-09-23"));
  check("スポーツ 2026-10-12(第2月)", isNationalHoliday("2026-10-12"));
  check("勤労感謝 2026-11-23", isNationalHoliday("2026-11-23"));
  check("平日は祝日でない 2026-06-15", !isNationalHoliday("2026-06-15"));

  console.log("\n[振替休日・国民の休日]");
  check("振替休日 2026-05-06（5/3が日曜）", holidayName("2026-05-06") === "振替休日", holidayName("2026-05-06"));
  check("国民の休日 2026-09-22（敬老21と秋分23の間）", holidayName("2026-09-22") === "国民の休日", holidayName("2026-09-22"));

  console.log("\n[classifyDay 手修正]");
  check("土曜は休日 2026-06-13", classifyDay("2026-06-13") === "holiday");
  check("平日は出勤日 2026-06-15", classifyDay("2026-06-15") === "workday");
  check("手修正で平日→休日", classifyDay("2026-06-15", { "2026-06-15": "holiday" }) === "holiday");
  check("手修正で土曜→出勤日", classifyDay("2026-06-13", { "2026-06-13": "workday" }) === "workday");

  console.log("\n[月次 休日労働（手修正で 6/8 を休日化）]");
  // 6/8 は月曜（通常は平日）。手修正で休日にすると holidayWorkMin が発生するはず
  const { data: cur } = await sb.from("app_settings").select("value").eq("key", "holiday_overrides").maybeSingle();
  const orig = (cur?.value as Record<string, string>) ?? {};
  await sb.from("app_settings").upsert({ key: "holiday_overrides", value: { "2026-06-08": "holiday" } }, { onConflict: "key" });
  try {
    const sum = await getMonthlySummary(sb, "202606");
    const worked0608 = sum.find((s) => s.byDay.some((d) => d.workDate === "2026-06-08"));
    check("6/8勤務者が存在", !!worked0608, sum.length);
    check("6/8が休日労働に計上", (worked0608?.holidayWorkMin ?? 0) > 0, worked0608?.holidayWorkMin);
    check("byDayにisHoliday/holidayName", worked0608?.byDay.some((d) => d.workDate === "2026-06-08" && d.isHoliday === true) ?? false);
  } finally {
    // 後始末（元のoverridesに戻す）
    await sb.from("app_settings").upsert({ key: "holiday_overrides", value: orig }, { onConflict: "key" });
  }
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(() => { console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`); process.exit(fail === 0 ? 0 : 1); });
