/**
 * 打刻履歴移行（event_log）。実行: npm run migrate:events
 *   勤怠ブックの event_log → events(+event_items)。drivers/shifts 取込後に実行すること。
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { workbookSheets, loadSheetObjects } from "@/lib/migrate/xlsx";
import { createDriverResolver } from "@/lib/migrate/roster";
import { importEventLog } from "@/lib/migrate/import-events";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const DIR = process.env.MIGRATE_DIR ?? "./migration/input";

async function main() {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".xlsx")).map((f) => join(DIR, f));
  let kintai: string | undefined;
  for (const f of files) {
    if ((await workbookSheets(f)).includes("event_log")) kintai = f;
  }
  if (!kintai) throw new Error("event_log を含むブックが見つかりません");

  const resolver = createDriverResolver(sb);
  await resolver.preload();
  const ev = await importEventLog(sb, await loadSheetObjects(kintai, "event_log", 1), resolver);
  console.log(`✓ events: ${ev.events}件 / 明細 ${ev.items}件 / スキップ ${ev.skipped} / driver新規 ${resolver.created()}`);
}

main().catch((e) => { console.error("移行エラー:", e); process.exit(1); });
