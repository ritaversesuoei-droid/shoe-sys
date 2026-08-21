import "server-only";

/**
 * スプレッドシート書き戻し（システム → GAS Web App → シート）。
 *   SHEET_WRITEBACK_URL（GASウェブアプリのURL）＋ SHEET_WRITEBACK_SECRET（合言葉）で有効化。
 *   未設定なら configured:false（安全に無効）。GAS 側は本文の secret を検証して書き込む。
 */
export interface WritebackResult {
  configured: boolean;
  ok?: boolean;
  applied?: number;
  note?: string;
  error?: string;
}

export async function pushToSheet(payload: Record<string, unknown>): Promise<WritebackResult> {
  const url = process.env.SHEET_WRITEBACK_URL?.trim();
  const secret = process.env.SHEET_WRITEBACK_SECRET?.trim();
  if (!url || !secret) {
    return { configured: false, note: "SHEET_WRITEBACK_URL / SHEET_WRITEBACK_SECRET が未設定です。" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, ...payload }),
      redirect: "follow", // GAS ウェブアプリは 302 を返すため follow
    });
    const text = await res.text();
    let data: { ok?: boolean; applied?: number; note?: string; error?: string } = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* GASがHTMLを返す＝公開設定/URL誤り */
    }
    if (!res.ok || data.ok === false) {
      return { configured: true, ok: false, error: data.error ?? `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { configured: true, ok: true, applied: data.applied, note: data.note };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
