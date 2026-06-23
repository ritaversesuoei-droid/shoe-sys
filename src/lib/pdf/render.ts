import "server-only";

import puppeteer, { type Browser } from "puppeteer-core";
import { AppError } from "@/lib/errors";

/**
 * HTML → PDF（仕様書 F-17 / 13章G: Puppeteer）。
 * 実行環境に応じてブラウザを解決する:
 *   1. PUPPETEER_EXECUTABLE_PATH（明示。コンテナ/セルフホストで Chrome を指す）
 *   2. サーバーレス（Vercel / AWS Lambda）→ @sparticuz/chromium（同梱Chromium）
 *   3. ローカル開発 → OS既定の Chrome 探索パス
 */
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const isServerless = (): boolean =>
  !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

async function launchBrowser(): Promise<Browser> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;

  // (2) サーバーレス: 明示パスが無ければ @sparticuz/chromium を使用（動的import=ローカルでは読み込まない）
  if (!envPath && isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // (1)(3) 明示パス or OS既定
  const executablePath =
    envPath ?? (process.platform === "darwin" ? MAC_CHROME : LINUX_CANDIDATES[0]!);
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    throw new AppError(
      `PDF生成用ブラウザを起動できません（サーバーレスは @sparticuz/chromium、` +
        `セルフホストは PUPPETEER_EXECUTABLE_PATH を確認）: ${
          e instanceof Error ? e.message : String(e)
        }`,
      500,
    );
  }
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    // puppeteer は B 系の名前付きフォーマット未対応のため、JIS B5 横を寸法指定（257×182mm）。
    const pdf = await page.pdf({
      width: "257mm",
      height: "182mm",
      printBackground: true,
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
