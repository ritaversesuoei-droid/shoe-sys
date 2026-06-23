/**
 * Markdown ドキュメント → A4 印刷用PDF。実行: npm run docs:pdf -- <入力.md> [出力.pdf]
 *   既定: docs/compliance-thresholds.md → docs/compliance-thresholds.pdf
 *   puppeteer-core + システムChrome（PUPPETEER_EXECUTABLE_PATH で上書き可）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LINUX = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
function chromePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return process.platform === "darwin" ? MAC_CHROME : LINUX[0]!;
}

const input = process.argv[2] ?? "docs/compliance-thresholds.md";
const output = process.argv[3] ?? input.replace(/\.md$/, ".pdf");

// GFM（表・タスクリスト）を有効化。チェックボックスは印刷向けに ☐/☑ へ。
marked.setOptions({ gfm: true, breaks: false });
const md = readFileSync(input, "utf8");
const bodyHtml = (await marked.parse(md))
  .replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/g, '<span class="cb">☑</span>')
  .replace(/<input[^>]*type="checkbox"[^>]*>/g, '<span class="cb">☐</span>');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
         color: #1e293b; font-size: 10.5pt; line-height: 1.65; }
  h1 { font-size: 17pt; border-bottom: 3px solid #0f172a; padding-bottom: 6px; margin: 0 0 6px; }
  h2 { font-size: 13pt; background: #0f172a; color: #fff; padding: 4px 8px; border-radius: 4px;
       margin: 18px 0 8px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #0f172a; border-left: 4px solid #2563eb; padding-left: 8px;
       margin: 14px 0 6px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9pt; page-break-inside: auto; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead th { background: #e2e8f0; }
  tr { page-break-inside: avoid; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 9pt; }
  blockquote { border-left: 4px solid #f59e0b; background: #fffbeb; margin: 10px 0; padding: 8px 12px;
               border-radius: 0 4px 4px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
  .cb { display: inline-block; width: 1.1em; font-size: 11pt; }
  strong { color: #0f172a; }
  a { color: #1e293b; text-decoration: none; }
</style></head><body>${bodyHtml}
<footer style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:6px;font-size:8pt;color:#64748b;">
  昭栄運輸 運行・勤怠管理システム / 改善基準告示 閾値確認資料（自動生成）
</footer></body></html>`;

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;">' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  writeFileSync(output, pdf);
  console.log(`✓ PDF生成: ${output}（${Math.round(pdf.length / 1024)} KB）`);
} finally {
  await browser.close();
}
