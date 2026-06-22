import "server-only";

import puppeteer from "puppeteer-core";
import { AppError } from "@/lib/errors";

/**
 * HTML → PDF（仕様書 F-17 / 13章G: Puppeteer）。
 * Chromium のフルDLを避けるため puppeteer-core を使用し、実行ファイルは
 * 環境変数 PUPPETEER_EXECUTABLE_PATH か、OS既定の探索パスから解決する。
 */
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function resolveExecutable(): string {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env) return env;
  if (process.platform === "darwin") return MAC_CHROME;
  return LINUX_CANDIDATES[0]!;
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const executablePath = resolveExecutable();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (e) {
    throw new AppError(
      `PDF生成用ブラウザを起動できません（PUPPETEER_EXECUTABLE_PATH を確認）: ${
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
