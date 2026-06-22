import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cleanText } from "./cleanse";

type SB = SupabaseClient<Database>;

/**
 * 移行用ドライバー名寄せ（仕様書 11.1: 数字の名寄せ）。
 * 既存ドライバーを氏名で索引し、無ければ生成（code は MGxxx の暫定。後でマスタ管理で正式IDへ）。
 */
export function createDriverResolver(sb: SB) {
  const byName = new Map<string, string>(); // 正規化氏名 -> id
  const codes = new Set<string>();
  let seq = 0;
  let created = 0;

  function nextCode(): string {
    let code: string;
    do {
      seq += 1;
      code = `MG${String(seq).padStart(3, "0")}`;
    } while (codes.has(code));
    codes.add(code);
    return code;
  }

  return {
    created: () => created,
    async preload() {
      const { data, error } = await sb.from("drivers").select("id, code, name");
      if (error) throw error;
      for (const d of data ?? []) {
        byName.set(cleanText(d.name), d.id);
        if (d.code) codes.add(d.code);
      }
    },
    /** 氏名からドライバーIDを解決（無ければ create 時に生成）。 */
    async resolve(
      rawName: string,
      opts: { affiliation?: string; create?: boolean } = {},
    ): Promise<string | null> {
      const name = cleanText(rawName);
      if (!name) return null;
      const hit = byName.get(name);
      if (hit) return hit;
      if (!opts.create) return null;
      const code = nextCode();
      const { data, error } = await sb
        .from("drivers")
        .insert({
          code,
          name,
          affiliation: opts.affiliation ? cleanText(opts.affiliation) : null,
          is_active: true,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error(`driver作成失敗: ${name}`);
      byName.set(name, data.id);
      created += 1;
      return data.id;
    },
  };
}
