/**
 * ミラー importShiftLog の「既存勤務の更新」検証。実行: npm run test:mirror-update
 *   並行運用ミラーで 確定出勤が先に入り 確定退勤が後追いで入るケースを再現し、
 *   既存行が UPDATE され（clock_out_at 反映）その driver が再計算対象(driverIds)に載ること、
 *   変化が無い再取込は skip して無駄な UPDATE を出さないこと（スラッシング防止）を確認する。
 *   実DBを使うためテスト用ドライバー/勤務は最後に物理削除する。
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { importShiftLog } from "@/lib/migrate/import-xlsx";
import { createDriverResolver } from "@/lib/migrate/roster";

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let pass = 0,
  fail = 0;
const check = (n: string, c: boolean, x?: unknown) => {
  c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}`, x ?? ""));
};

const name = `MIG_UPD_${Date.now()}`;
const base: Record<string, string> = {
  "ドライバー名": name,
  "開始日": "2026-08-01",
  "確定出勤": "2026-08-01 08:00",
  "確定退勤": "",
};

async function run(row: Record<string, string>) {
  const r = createDriverResolver(sb);
  await r.preload();
  return importShiftLog(sb, [row], r);
}

let driverId: string | undefined;
try {
  const r1 = await run({ ...base });
  check("初回 inserted=1", r1.inserted === 1, r1);
  const { data: drv } = await sb.from("drivers").select("id").eq("name", name).maybeSingle();
  driverId = drv?.id;
  const { data: sh1 } = await sb.from("shifts").select("clock_out_at").eq("driver_id", driverId!).maybeSingle();
  check("初回 clock_out_at=null（未退勤で取込）", sh1?.clock_out_at == null, sh1?.clock_out_at);

  const r2 = await run({ ...base, "確定退勤": "2026-08-01 18:00" });
  check("2回目 updated=1（後追い退勤を反映）", r2.updated === 1, r2);
  check("2回目 inserted=0（重複を作らない）", r2.inserted === 0, r2);
  check("2回目 driverIds に含む（再計算対象）", r2.driverIds.includes(driverId!), r2.driverIds);
  const { data: sh2 } = await sb.from("shifts").select("clock_out_at").eq("driver_id", driverId!).maybeSingle();
  check("退勤が反映される", !!sh2?.clock_out_at, sh2?.clock_out_at);

  const r3 = await run({ ...base, "確定退勤": "2026-08-01 18:00" });
  check("3回目 変化なしで skip（無駄書き無し）", r3.updated === 0 && r3.skipped === 1, r3);
} finally {
  if (driverId) {
    await sb.from("shifts").delete().eq("driver_id", driverId);
    await sb.from("drivers").delete().eq("id", driverId);
  }
  console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
  process.exit(fail === 0 ? 0 : 1);
}
