/**
 * マスタ移行インポータ（仕様書 第11章）。実行: npm run migrate:masters
 *   MIGRATE_DIR（既定 ./migration/input）配下のCSVを読み、クレンジングして Supabase へ投入。
 *   対象: drivers.csv / vehicles.csv / customers.csv / dispatch_plans.csv（存在するもののみ）。
 *   冪等: drivers/vehicles は自然キーで upsert、customers/dispatch_plans は存在チェックで重複回避。
 *   ※ events/shifts/daily_reports の移行は現行シート構造に依存するため別途（本書 11.1 参照）。
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCsv, cleanText, cleanCode, parseDateLoose } from "@/lib/migrate/cleanse";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const DIR = process.env.MIGRATE_DIR ?? "./migration/input";

function read(file: string): Record<string, string>[] | null {
  const p = join(DIR, file);
  if (!existsSync(p)) return null;
  return parseCsv(readFileSync(p, "utf8"));
}

async function importDrivers() {
  const rows = read("drivers.csv");
  if (!rows) return console.log("- drivers.csv なし（スキップ）");
  const payload = rows
    .map((r) => ({
      code: cleanCode(r.code),
      name: cleanText(r.name),
      line_user_id: r.line_user_id ? cleanText(r.line_user_id) : null,
      default_vehicle_no: r.default_vehicle_no ? cleanCode(r.default_vehicle_no) : null,
      affiliation: r.affiliation ? cleanText(r.affiliation) : null,
    }))
    .filter((r) => r.code && r.name);
  const { error } = await sb.from("drivers").upsert(payload, { onConflict: "code" });
  if (error) throw error;
  console.log(`✓ drivers: ${payload.length}件 upsert`);
}

async function importVehicles() {
  const rows = read("vehicles.csv");
  if (!rows) return console.log("- vehicles.csv なし（スキップ）");
  const payload = rows
    .map((r) => ({
      vehicle_no: cleanCode(r.vehicle_no),
      name: r.name ? cleanText(r.name) : null,
      kind: r.kind ? cleanText(r.kind) : null,
    }))
    .filter((r) => r.vehicle_no);
  const { error } = await sb.from("vehicles").upsert(payload, { onConflict: "vehicle_no" });
  if (error) throw error;
  console.log(`✓ vehicles: ${payload.length}件 upsert`);
}

async function importCustomers() {
  const rows = read("customers.csv");
  if (!rows) return console.log("- customers.csv なし（スキップ）");
  let inserted = 0;
  for (const r of rows) {
    const name = cleanText(r.name);
    if (!name) continue;
    const address = r.address ? cleanText(r.address) : null;
    const { data: ex } = await sb
      .from("customers")
      .select("id")
      .eq("name", name)
      .limit(1)
      .maybeSingle();
    if (ex) continue;
    const { error } = await sb.from("customers").insert({
      name,
      address,
      postal_code: r.postal_code ? cleanCode(r.postal_code) : null,
      yago: r.yago ? cleanText(r.yago) : null,
    });
    if (error) throw error;
    inserted++;
  }
  console.log(`✓ customers: ${inserted}件 新規 (既存スキップ)`);
}

async function importDispatchPlans() {
  const rows = read("dispatch_plans.csv");
  if (!rows) return console.log("- dispatch_plans.csv なし（スキップ）");
  const { data: drivers } = await sb.from("drivers").select("id, code");
  const codeToId = new Map((drivers ?? []).map((d) => [d.code, d.id]));
  let inserted = 0;
  for (const r of rows) {
    const planDate = parseDateLoose(r.plan_date);
    if (!planDate) continue;
    const driverId = r.driver_code ? codeToId.get(cleanCode(r.driver_code)) ?? null : null;
    const deliverySpot = r.delivery_spot ? cleanText(r.delivery_spot) : null;
    const { data: ex } = await sb
      .from("dispatch_plans")
      .select("id")
      .eq("plan_date", planDate)
      .eq("driver_id", driverId)
      .eq("delivery_spot", deliverySpot ?? "")
      .limit(1)
      .maybeSingle();
    if (ex) continue;
    const { error } = await sb.from("dispatch_plans").insert({
      plan_date: planDate,
      driver_id: driverId,
      driver_name_raw: r.driver_name ? cleanText(r.driver_name) : null,
      vehicle_no: r.vehicle_no ? cleanCode(r.vehicle_no) : null,
      shipper: r.shipper ? cleanText(r.shipper) : null,
      delivery_spot: deliverySpot,
      highway_instruction: r.highway_instruction ? cleanText(r.highway_instruction) : null,
      is_subcontract: /^(1|true|子車|傭車)$/i.test((r.is_subcontract ?? "").trim()),
    });
    if (error) throw error;
    inserted++;
  }
  console.log(`✓ dispatch_plans: ${inserted}件 新規`);
}

async function main() {
  console.log(`移行ディレクトリ: ${DIR}`);
  await importDrivers();
  await importVehicles();
  await importCustomers();
  await importDispatchPlans();
  console.log("\n完了。検証: 件数・突合（本書 11.2）を確認してください。");
}

main().catch((e) => {
  console.error("移行エラー:", e);
  process.exit(1);
});
