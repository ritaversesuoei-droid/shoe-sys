import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PDF/PNG 用の日本語フォント埋め込み。
 *   @sparticuz/chromium 同梱フォント(fonts.tar.br)には日本語(CJK)が無く、Vercel では日本語が
 *   まったく描画されない（英数字・記号だけ残る）。fontconfig は woff2 非対応・可変フォントの
 *   ウェイト解決も不安定なため、確実な方法として woff2 を @font-face(base64) で HTML に直接埋め込む。
 *   ローカル(mac)/本番で同一の見た目になる。フォント実体は assets/fonts に同梱し、
 *   PDF系ルートは next.config の outputFileTracingIncludes で関数バンドルへ含める。
 */

let cachedStyle: string | null = null;

function buildStyle(): string {
  try {
    const dir = join(process.cwd(), "assets", "fonts");
    const b64 = (f: string) => readFileSync(join(dir, f)).toString("base64");
    const r400 = b64("NotoSansJP-400.woff2");
    const r700 = b64("NotoSansJP-700.woff2");
    return (
      `<style>` +
      `@font-face{font-family:'Noto Sans JP';font-style:normal;font-weight:400;font-display:block;` +
      `src:url(data:font/woff2;base64,${r400}) format('woff2');}` +
      `@font-face{font-family:'Noto Sans JP';font-style:normal;font-weight:700;font-display:block;` +
      `src:url(data:font/woff2;base64,${r700}) format('woff2');}` +
      `</style>`
    );
  } catch {
    // フォントが見つからない場合でも生成は止めない（テンプレの sans-serif にフォールバック）
    return "";
  }
}

/** 日本語 @font-face の <style>（base64 埋め込み）。初回のみ読み込み、以降キャッシュ。 */
export function jpFontStyle(): string {
  if (cachedStyle === null) cachedStyle = buildStyle();
  return cachedStyle;
}

/** HTML の </head> 直前に日本語フォントの <style> を差し込む（テンプレ非依存で共通適用）。 */
export function withJpFont(html: string): string {
  const style = jpFontStyle();
  if (!style) return html;
  return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : style + html;
}
