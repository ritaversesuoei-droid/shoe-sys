/**
 * LINE Flex 構築 検証（仕様書 F-16）。実行: npm run test:line
 *   実送信はせず、Flexメッセージ構造の妥当性のみ検証（pure関数）。
 */
import { buildReportFlex, buildWarningFlex } from "@/lib/line/flex";

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

console.log("\n[業務報告 Flex]");
const report = buildReportFlex({
  driverName: "庄栄 太郎",
  title: "積込完了",
  vehicleNo: "1001",
  place: "東京都江東区",
  lines: [
    { label: "荷主", value: "荷主X" },
    { label: "数量/重量", value: "10 / 2t" },
  ],
  mapUrl: "https://www.google.com/maps?q=35.6,139.8",
});
check("type=flex", report.type === "flex");
check("altText に種別と氏名", report.altText.includes("積込完了") && report.altText.includes("庄栄 太郎"));
check("bubble body を持つ", report.contents.type === "bubble" && !!(report.contents as any).body);
check("地図ボタン(footer)あり", !!(report.contents as any).footer);

console.log("\n[警告 Flex]");
const warn = buildWarningFlex({
  driverName: "庄栄 次郎",
  workDate: "2026-06-20",
  violations: [{ message: "拘束時間が上限(15:00)を超過" }, { message: "休息期間が下限(9:00)未満" }],
});
check("type=flex", warn.type === "flex");
check("altText に警告対象", warn.altText.includes("庄栄 次郎") && warn.altText.includes("2026-06-20"));
check("違反内容が本文に含まれる", JSON.stringify(warn.contents).includes("拘束時間が上限"));

console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
