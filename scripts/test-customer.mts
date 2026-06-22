/**
 * 客先名推定・逆ジオコーディング 検証（仕様書 F-22）。実行: npm run test:customer
 *   findCustomerName(DB一致) を実DBで検証。逆ジオは外部APIのためベストエフォート（参考表示）。
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { findCustomerName } from "@/lib/operations/customer";
import { reverseGeocode } from "@/lib/geo/reverse";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

const ids: string[] = [];
async function mkCustomer(c: { name: string; yago?: string; address?: string }) {
  const { data, error } = await sb.from("customers").insert(c).select("id").single();
  if (error || !data) throw error ?? new Error("customer作成失敗");
  ids.push(data.id);
  return data.id;
}

async function main() {
  const tag = `Z${Date.now() % 100000}`;
  await mkCustomer({ name: `物流センター_${tag}`, yago: `ヤゴウ${tag}`, address: `江東区青海_${tag}` });
  await mkCustomer({ name: `商店_${tag}`, address: `西区みなとみらい_${tag}` });

  console.log("\n[客先名推定 findCustomerName]");
  const byYago = await findCustomerName(sb, `江東区青海2-1 ヤゴウ${tag}の倉庫前`);
  check("屋号一致で客先を特定", byYago?.name === `物流センター_${tag}`, byYago);

  const byAddr = await findCustomerName(sb, `西区みなとみらい_${tag}`);
  check("住所部分一致で客先を特定", byAddr?.name === `商店_${tag}`, byAddr);

  const none = await findCustomerName(sb, `札幌市中央区_該当なし`);
  check("該当なしは null", none === null, none);

  console.log("\n[逆ジオコーディング reverseGeocode（外部API・参考）]");
  const geo = await reverseGeocode(35.6809, 139.7673); // 東京駅付近
  check("結果オブジェクトを返す（throwしない）", typeof geo === "object");
  console.log("  取得住所:", geo.address ?? "(取得できず/ネットワーク依存)");
}

async function cleanup() {
  for (const id of ids) await sb.from("customers").delete().eq("id", id);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
