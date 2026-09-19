/**
 * 燃費マスタ投入: 現行シート「マスタ」の 目標燃費 / P-Wランク / 正常燃費レンジ を
 * drivers（code 突合）へ反映する。※0020 マイグレーション適用後に実行すること。
 * 実行: npm run seed:fuel-master
 * 注意: 値は現行シート（2026-09時点）から転記。運用開始時に社労士/管理者と最終確認のこと。
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const sb = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// code(社員番号): [目標燃費, P/Wランク, 正常下限, 正常上限]
const MASTER: Record<string, [number | null, string | null, number | null, number | null]> = {
  "1": [2.65, null, null, null],
  "2": [3.33, "①", 2, 5.3],
  "3": [0, null, null, null],
  "4": [2.35, null, 1.7, 3.5],
  "8": [2.51, "①", 1.7, 3.5],
  "10": [2.76, null, 2, 5.3],
  "11": [2.74, null, 2, 5.3],
  "14": [0, null, null, null],
  "15": [2.65, null, 1.7, 3.5],
  "16": [0, null, null, null],
  "17": [3.1, null, 2, 5.3],
  "18": [2.48, null, 2, 5.3],
  "19": [3.3, null, null, null],
  "20": [3.46, "①", 2, 5.3],
  "21": [3.33, null, 2, 5.3],
  "24": [2.3, null, 1.7, 3.5],
  "25": [3.82, "⑤", 2, 5.3],
  "26": [3.24, null, 2, 5.3],
  "27": [3.33, "①", 2, 5.3],
  "28": [6.69, "0⃣", 5, 7.5],
  "29": [3.24, null, 2, 5.3],
  "30": [6.45, null, 5, 7.5],
  "31": [3.24, null, 2, 5.3],
  "32": [3.24, null, 2, 5.3],
  "99": [5.43, null, 5, 7.5],
};

async function main() {
  let updated = 0;
  let missing = 0;
  for (const [code, [target, rank, min, max]] of Object.entries(MASTER)) {
    const { data, error } = await sb
      .from("drivers")
      .update({ target_fuel_km_l: target, prize_rank: rank, normal_fuel_min: min, normal_fuel_max: max })
      .eq("code", code)
      .select("id");
    if (error) {
      console.error(`code=${code} 更新エラー:`, error.message);
      continue;
    }
    if (!data || data.length === 0) {
      missing++;
      console.warn(`code=${code} に該当ドライバーなし（スキップ）`);
    } else {
      updated += data.length;
      console.log(`code=${code} 更新: 目標${target} / ランク${rank ?? "-"} / 正常${min ?? "-"}〜${max ?? "-"}`);
    }
  }
  console.log(`\n===== 完了: 更新 ${updated} 件 / 該当なし ${missing} 件 =====`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
