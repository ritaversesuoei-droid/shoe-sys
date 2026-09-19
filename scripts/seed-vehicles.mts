/**
 * 車両マスタ 一括投入: 配車(dispatch_plans)・ドライバー(default_vehicle_no)・給油(fuel_logs)に
 * 現れる全車番を vehicles に登録する（未登録のみ挿入・既存は触らない）。
 * 実行: npm run seed:vehicles
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

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

async function main() {
  const nums = new Set<string>();

  const { data: dp } = await sb.from("dispatch_plans").select("vehicle_no").not("vehicle_no", "is", null).limit(20000);
  for (const r of dp ?? []) { const v = norm(r.vehicle_no); if (v) nums.add(v); }

  const { data: drv } = await sb.from("drivers").select("default_vehicle_no").not("default_vehicle_no", "is", null);
  for (const r of drv ?? []) { const v = norm(r.default_vehicle_no); if (v) nums.add(v); }

  // fuel_logs は未作成環境でもエラーにしない
  try {
    const { data: fl } = await sb.from("fuel_logs").select("vehicle_no").not("vehicle_no", "is", null).limit(20000);
    for (const r of fl ?? []) { const v = norm(r.vehicle_no); if (v) nums.add(v); }
  } catch { /* テーブル無しは無視 */ }

  const { data: existing } = await sb.from("vehicles").select("vehicle_no");
  const have = new Set((existing ?? []).map((r) => norm(r.vehicle_no)));

  const toInsert = [...nums].filter((v) => !have.has(v)).sort();
  console.log(`集約車番: ${nums.size} / 既存: ${have.size} / 新規投入: ${toInsert.length}`);
  if (toInsert.length === 0) { console.log("追加なし"); return; }

  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200).map((vehicle_no) => ({ vehicle_no }));
    const { error } = await sb.from("vehicles").insert(chunk);
    if (error) { console.error("挿入エラー:", error.message); break; }
  }
  const { count } = await sb.from("vehicles").select("id", { count: "exact", head: true });
  console.log(`\n完了: vehicles 総数 ${count} 台`);
}

main().catch((e) => { console.error(e); process.exit(1); });
