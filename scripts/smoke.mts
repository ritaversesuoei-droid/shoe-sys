/**
 * ルート・スモークテスト。実行: npm run smoke（要 dev or start が localhost:3000 で稼働）
 *   全ルートを叩き 500 系が無いことを確認（.nextキャッシュ破損・SSRランタイムエラーの早期検知）。
 *   認証ページは未認証で 200/307 を期待（リダイレクト含む）。API は 401。いずれも 5xx は失敗。
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const PAGES = [
  "/", "/driver", "/office", "/admin", "/admin/login", "/admin/monthly", "/admin/warnings",
  "/driver/history", "/driver/report", "/driver/punch/loading", "/driver/punch/clock_out",
];
const APIS = [
  "/api/events/today", "/api/dispatch-plans/today", "/api/admin/board",
  "/api/admin/warnings", "/api/admin/line-usage", "/api/daily-reports?date=2026-06-22",
  "/api/vehicles/1001/last-meter",
];

let fail = 0;
async function hit(path: string) {
  try {
    const res = await fetch(BASE + path, { redirect: "manual" });
    const bad = res.status >= 500;
    if (bad) fail++;
    console.log(`  ${bad ? "✗" : "✓"} ${path} → ${res.status}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${path} → 接続失敗 ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log(`[smoke] ${BASE}`);
  console.log("画面:");
  for (const p of PAGES) await hit(p);
  console.log("API:");
  for (const p of APIS) await hit(p);
  console.log(`\n===== 5xx: ${fail} 件 =====`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
