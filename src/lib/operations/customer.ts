import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { reverseGeocode } from "@/lib/geo/reverse";

type SB = SupabaseClient<Database>;

/**
 * 住所文字列から客先を推定（仕様書 F-22: 客先名・屋号マスタ学習）。
 *   1) 屋号(yago)が住所に含まれる → その客先
 *   2) 客先住所と相互に部分一致（より長い一致を優先）
 * 該当なしは null。
 */
export async function findCustomerName(
  sb: SB,
  address: string,
): Promise<{ customerId: string; name: string } | null> {
  if (!address) return null;
  const { data: customers, error } = await sb
    .from("customers")
    .select("id, name, address, yago");
  if (error || !customers) return null;

  // 1) 屋号一致
  for (const c of customers) {
    if (c.yago && address.includes(c.yago)) {
      return { customerId: c.id, name: c.name };
    }
  }
  // 2) 住所の部分一致（最長一致）
  let best: { customerId: string; name: string; score: number } | null = null;
  for (const c of customers) {
    if (!c.address) continue;
    const a = c.address;
    if (address.includes(a) || a.includes(address)) {
      const score = Math.min(a.length, address.length);
      if (!best || score > best.score) best = { customerId: c.id, name: c.name, score };
    }
  }
  return best ? { customerId: best.customerId, name: best.name } : null;
}

/**
 * 位置情報の補完（仕様書 F-22）。住所が無ければ逆ジオコーディングで取得し、
 * 客先を推定して customer_id を返す。すべてベストエフォート。
 */
export async function enrichLocation(
  sb: SB,
  input: { lat?: number | null; lng?: number | null; address?: string | null },
): Promise<{ address: string | null; customerId: string | null }> {
  let address = input.address ?? null;
  if (!address && input.lat != null && input.lng != null) {
    const g = await reverseGeocode(input.lat, input.lng);
    address = g.address;
  }
  let customerId: string | null = null;
  if (address) {
    const c = await findCustomerName(sb, address);
    customerId = c?.customerId ?? null;
  }
  return { address, customerId };
}
