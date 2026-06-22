/**
 * 日報PDF 検証（仕様書 F-17）。実行: npm run test:pdf
 *   テンプレHTML生成 → Chrome(puppeteer-core)でPDF化 → Storageへ保存 → 署名付きURL。
 *   server-only モジュールは tsx から import 不可のため、描画/保存処理は本スクリプトで等価に再現。
 */
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { renderDailyReportHtml } from "@/lib/pdf/daily-report-template";

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail?: unknown) =>
  cond ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`, detail ?? ""));

async function main() {
  console.log("\n[1] テンプレートHTML生成");
  const html = renderDailyReportHtml({
    reportDate: "2026-06-20",
    driverName: "庄栄 太郎",
    driverCode: "01",
    vehicleNo: "1001",
    departureAt: "2026-06-20T06:00:00+09:00",
    returnAt: "2026-06-20T18:00:00+09:00",
    meterStart: 1000,
    meterEnd: 1300,
    restraintMin: 720,
    legs: [
      { seq: 1, shipper: "荷主X", origin_spot: "江東区", destination_spot: "横浜市", cargo: "鋼材 2t", receipts: "1", meter: 1150 },
      { seq: 2, shipper: "荷主Y", origin_spot: "品川区", destination_spot: "川崎市", cargo: "建材 1t", receipts: "2", meter: 1250 },
    ],
    rests: [
      { rest_type: "rest", place: "海老名SA", start_at: "2026-06-20T11:00:00+09:00", end_at: "2026-06-20T13:00:00+09:00", duration_min: 120 },
    ],
    notes: "渋滞により30分遅延",
    drivable: true,
  });
  check("HTMLに日本語見出し", html.includes("運　行　日　報"));
  check("明細・荷主が反映", html.includes("荷主X") && html.includes("横浜市"));

  console.log("\n[2] Chrome で PDF 生成");
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH!;
  check("PUPPETEER_EXECUTABLE_PATH 設定済み", !!executablePath, executablePath);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  let pdf: Uint8Array;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    pdf = await page.pdf({
      width: "257mm",
      height: "182mm",
      printBackground: true,
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
    });
  } finally {
    await browser.close();
  }
  const header = Buffer.from(pdf.slice(0, 5)).toString("latin1");
  check("PDFヘッダ(%PDF-)", header.startsWith("%PDF-"), header);
  check("PDFサイズが妥当(>3KB)", pdf.length > 3000, `${pdf.length}bytes`);

  console.log("\n[3] Storage 保存 + 署名付きURL");
  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const BUCKET = "reports";
  const { error: bErr } = await sb.storage.createBucket(BUCKET, { public: false });
  check("バケット用意(冪等)", !bErr || /exist|already/i.test(bErr.message), bErr?.message);
  const path = `__test__/${Date.now()}.pdf`;
  const { error: uErr } = await sb.storage
    .from(BUCKET)
    .upload(path, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });
  check("アップロード成功", !uErr, uErr?.message);
  const { data: signed, error: sErr } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  check("署名付きURL生成", !!signed?.signedUrl && !sErr, sErr?.message);

  // クリーンアップ（テストオブジェクト削除）
  await sb.storage.from(BUCKET).remove([path]);
}

main()
  .catch((e) => { fail++; console.error("実行エラー:", e); })
  .finally(() => {
    console.log(`\n===== 結果: PASS ${pass} / FAIL ${fail} =====`);
    process.exit(fail === 0 ? 0 : 1);
  });
