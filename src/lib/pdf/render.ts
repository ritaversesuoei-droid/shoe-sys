import "server-only";

import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { AppError } from "@/lib/errors";
import { withJpFont } from "@/lib/pdf/jp-font";

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
    // @sparticuz/chromium は AWS_EXECUTION_ENV でランタイム(AL2/AL2023)を判定し、その時だけ共有ライブラリ
    //   (libnss3.so 等 = al2*.tar.br) を /tmp/al2(023)/lib に展開し LD_LIBRARY_PATH を通す。
    //   Vercel はこの変数を期待どおり設定しないため判定が false になり、lib を展開せず
    //   「libnss3.so: cannot open shared object file」で起動失敗する。
    //   → import 前に Node のメジャーバージョンに合わせて設定する（モジュール top-level で
    //     LD_LIBRARY_PATH を組む処理が走るため、import より必ず前に設定する必要がある）。
    if (!/AWS_Lambda_nodejs/.test(process.env.AWS_EXECUTION_ENV ?? "")) {
      const nodeMajor = Number(process.versions.node.split(".")[0]) || 0;
      // 20.x/22.x → AL2023(al2023.tar.br) / それ未満 → AL2(al2.tar.br)
      process.env.AWS_EXECUTION_ENV = nodeMajor >= 20 ? "AWS_Lambda_nodejs20.x" : "AWS_Lambda_nodejs18.x";
    }
    const chromium = (await import("@sparticuz/chromium")).default;
    // 同梱の日本語フォント(fonts.tar.br)も executablePath() 内で /tmp/fonts へ展開される（豆腐□対策）。
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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

/**
 * 埋め込み日本語フォント(Noto Sans JP 400/700)を出力前に確実にロードさせる。
 *   font-display:block + 遅延読み込みのため、明示ロード→fonts.ready を待たないと、
 *   まだ読み込まれていないウェイトの文字が空白で出力されるレースがある。
 */
async function ensureFontsLoaded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    type Fonts = { load?: (font: string) => Promise<unknown>; ready?: Promise<unknown> };
    const fonts = (document as unknown as { fonts?: Fonts }).fonts;
    try {
      if (fonts?.load) {
        await Promise.all([
          fonts.load('400 16px "Noto Sans JP"'),
          fonts.load('700 16px "Noto Sans JP"'),
        ]);
      }
      await fonts?.ready;
    } catch {
      /* fonts API 非対応環境でも続行 */
    }
  });
}

export interface PdfOptions {
  format?: "A4"; // 名前付きフォーマット（A4のみ・B系は未対応）。未指定は既定の寸法指定(B5横)。
  landscape?: boolean;
  margin?: { top: string; bottom: string; left: string; right: string };
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
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
    await page.setContent(withJpFont(html), { waitUntil: "networkidle0" });
    await ensureFontsLoaded(page);
    const pdf = opts.format
      ? await page.pdf({
          format: opts.format,
          landscape: opts.landscape ?? false,
          printBackground: true,
          margin: opts.margin ?? { top: "6mm", bottom: "6mm", left: "6mm", right: "6mm" },
        })
      : // 既定: puppeteer は B 系の名前付きフォーマット未対応のため JIS B5 横を寸法指定（257×182mm）。
        await page.pdf({
          width: "257mm",
          height: "182mm",
          printBackground: true,
          margin: opts.margin ?? { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
        });
    return pdf;
  } finally {
    await browser.close();
  }
}

/** HTML → PNG（LINEリッチメニュー画像など固定サイズの画像生成用）。 */
export async function htmlToPng(
  html: string,
  opts: { width: number; height: number },
): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    await page.setContent(withJpFont(html), { waitUntil: "networkidle0" });
    await ensureFontsLoaded(page);
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    });
    return buf as Uint8Array;
  } finally {
    await browser.close();
  }
}
