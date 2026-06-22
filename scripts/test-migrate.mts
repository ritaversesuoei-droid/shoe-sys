/**
 * 移行クレンジング 検証（仕様書 11.2）。実行: npm run test:migrate
 *   外部依存なしの純関数テスト。
 */
import {
  toHankaku,
  cleanText,
  cleanCode,
  parseNumberLoose,
  parseDateLoose,
  parseDateTimeLoose,
  splitMultiValue,
  parseCsv,
} from "@/lib/migrate/cleanse";

let pass = 0,
  fail = 0;
const eq = (label: string, got: unknown, exp: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}: got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`));
};

console.log("\n[全半角・整形]");
eq("toHankaku 全角英数", toHankaku("１２３ＡＢＣ　ＤＥＦ"), "123ABC DEF");
eq("cleanText 連続空白圧縮", cleanText("  ＡＢ　 Ｃ "), "AB C");
eq("cleanCode 空白除去", cleanCode(" １０ ０１ "), "1001");

console.log("\n[数値の表記ゆれ]");
eq("全角カンマ数値", parseNumberLoose("１，２３４"), 1234);
eq("カンマ区切り", parseNumberLoose("1,234"), 1234);
eq("小数", parseNumberLoose("12.5"), 12.5);
eq("非数値はnull", parseNumberLoose("2 t"), null);
eq("空はnull", parseNumberLoose(""), null);

console.log("\n[日付・日時の表記ゆれ]");
eq("yyyy/M/d", parseDateLoose("2024/5/1"), "2024-05-01");
eq("全角年月日", parseDateLoose("２０２４年５月１日"), "2024-05-01");
eq("ISO日付", parseDateLoose("2024-12-31"), "2024-12-31");
eq("日時(JST付与)", parseDateTimeLoose("2024/05/01 8:30"), "2024-05-01T08:30:00+09:00");
eq("日時秒あり", parseDateTimeLoose("2024/12/31 23:59:30"), "2024-12-31T23:59:30+09:00");

console.log("\n[多値分割・CSV]");
eq("改行/読点/カンマ分割", splitMultiValue("A\nB、C,D"), ["A", "B", "C", "D"]);
eq("CSV(引用符内カンマ)", parseCsv('a,b\n1,2\n"x,y",3'), [{ a: "1", b: "2" }, { a: "x,y", b: "3" }]);

console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
