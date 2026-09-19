/**
 * 燃費計算（純関数）テスト。現行GAS saveData / generateMonthlySummary の移植を実データで検証。
 * 実行: npm run test:fuel  （純関数のみ・DB不要）
 */
import { computeFuel, basePrizeOf, flexPrizeOf, isOutOfNormal, type PriorFill } from "@/lib/operations/fuel";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail ?? ""); }
}

console.log("\n[computeFuel] 満タン（つなぎ無し）");
{
  // 荒川 車1: 前回満タン475,974 → 今回満タン477,945(506L) = 1,971km / 506 = 3.90
  const prior: PriorFill[] = [{ odometer: 475974, liters: 340, isFull: true }];
  const r = computeFuel(prior, 477945, 506, true);
  check("走行距離=1971", r.deltaKm === 1971, r);
  check("今回燃費=3.9", r.fuelKmL === 3.9, r);
}

console.log("\n[computeFuel] 満タン（つなぎ合算）");
{
  // 佐竹 車1000: 前回満タン272,578 →(つなぎ273,540/150L)→ 満タン273,779/233L
  //   = (1201km) / (233+150=383L) = 3.14
  const prior: PriorFill[] = [
    { odometer: 273540, liters: 150, isFull: false },
    { odometer: 272578, liters: 204, isFull: true },
  ];
  const r = computeFuel(prior, 273779, 233, true);
  check("走行距離=239（直前ODD差）", r.deltaKm === 239, r);
  check("今回燃費=3.14（つなぎ合算）", r.fuelKmL === 3.14, r);
}

console.log("\n[computeFuel] つなぎ給油は今回燃費なし");
{
  const prior: PriorFill[] = [{ odometer: 272578, liters: 204, isFull: true }];
  const r = computeFuel(prior, 273540, 150, false);
  check("走行距離=962", r.deltaKm === 962, r);
  check("今回燃費=null", r.fuelKmL === null, r);
}

console.log("\n[computeFuel] 初回給油・逆転");
{
  const first = computeFuel([], 100000, 300, true);
  check("初回は走行距離0・燃費null", first.deltaKm === 0 && first.fuelKmL === null, first);
  const rev = computeFuel([{ odometer: 500000, liters: 300, isFull: true }], 499000, 300, true);
  check("逆転は走行距離0", rev.deltaKm === 0, rev);
}

console.log("\n[プライズ] 基礎（P/Wランク）");
check("①=5000", basePrizeOf("①") === 5000);
check("⑤=9000", basePrizeOf("⑤") === 9000);
check("0⃣=3000", basePrizeOf("0⃣") === 3000);
check("無し=0", basePrizeOf(null) === 0);

console.log("\n[プライズ] 変動（差に連動・GAS式）");
check("+0.52 → 7,200", flexPrizeOf(0.52) === 7200);
check("+1.03 → 12,300", flexPrizeOf(1.03) === 12300);
check("+0.11 → 3,100（0.1以上は基礎2000込）", flexPrizeOf(0.11) === 3100);
check("+0.07 → 700（0.1未満）", flexPrizeOf(0.07) === 700);
check("+0.09 → 900", flexPrizeOf(0.09) === 900);
check("0以下 → 0", flexPrizeOf(0) === 0 && flexPrizeOf(-0.5) === 0);

console.log("\n[正常燃費レンジ外判定]");
check("1.8 (2〜5.3) は外", isOutOfNormal(1.8, 2, 5.3) === true);
check("3.0 (2〜5.3) は正常", isOutOfNormal(3.0, 2, 5.3) === false);
check("6.0 (2〜5.3) は外", isOutOfNormal(6.0, 2, 5.3) === true);
check("null は対象外", isOutOfNormal(null, 2, 5.3) === false);

console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
