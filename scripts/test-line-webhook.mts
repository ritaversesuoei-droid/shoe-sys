/**
 * LINE Webhook イベント処理 結合テスト。実行: npm run test:webhook
 *   友だち追加→案内 / 番号送信→ドライバー連携 / ブロック→連携解除 を検証。
 *   返信(reply)は LINE 未設定時はスキップされ、連携(DB更新)は実行される。
 *   server-only を読むため --conditions=react-server で実行。
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { handleWebhookEvents, type LineWebhookEvent } from "@/lib/line/webhook";

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

const ids: string[] = [];
async function makeDriver(code: string, name: string): Promise<string> {
  const { data, error } = await sb.from("drivers").insert({ code, name }).select("id").single();
  if (error || !data) throw error ?? new Error("driver作成失敗");
  ids.push(data.id);
  return data.id;
}
function msg(text: string, userId: string): LineWebhookEvent {
  return { type: "message", replyToken: "", source: { type: "user", userId }, message: { type: "text", text } };
}

async function main() {
  const code = String(700 + (Date.now() % 99));
  const driverId = await makeDriver(code, `WH_TEST_${Date.now()}`);
  const U = "Utest_" + (Date.now() % 1000000);

  console.log("\n[1] 友だち追加（案内・例外なし）");
  await handleWebhookEvents([{ type: "follow", replyToken: "", source: { type: "user", userId: U } }]);
  check("follow が例外なく処理される", true);

  console.log("\n[2] 番号送信 → 連携");
  await handleWebhookEvents([msg(code, U)]);
  const { data: d1 } = await sb.from("drivers").select("line_user_id").eq("id", driverId).single();
  check("line_user_id が連携される", d1?.line_user_id === U, d1?.line_user_id);

  console.log("\n[3] 前ゼロ揺れ（0+code）でも連携");
  await sb.from("drivers").update({ line_user_id: null }).eq("id", driverId);
  await handleWebhookEvents([msg(`0${code}`, U)]);
  const { data: d2 } = await sb.from("drivers").select("line_user_id").eq("id", driverId).single();
  check("前ゼロ付き番号でも連携", d2?.line_user_id === U, d2?.line_user_id);

  console.log("\n[4] 存在しない番号（連携されない）");
  const U2 = "Unone_" + (Date.now() % 1000000);
  await handleWebhookEvents([msg("999", U2)]);
  const { count } = await sb.from("drivers").select("id", { count: "exact", head: true }).eq("line_user_id", U2);
  check("存在しない番号は連携しない", (count ?? 0) === 0, count);

  console.log("\n[5] ブロック（unfollow）→ 連携解除");
  await handleWebhookEvents([{ type: "unfollow", source: { type: "user", userId: U } }]);
  const { data: d3 } = await sb.from("drivers").select("line_user_id").eq("id", driverId).single();
  check("unfollow で連携解除", d3?.line_user_id === null, d3?.line_user_id);
}

async function cleanup() {
  for (const id of ids) await sb.from("drivers").delete().eq("id", id);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(async () => { await cleanup(); console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`); process.exit(fail === 0 ? 0 : 1); });
