"use client";

/**
 * LIFF 初期化ヘルパー（ドライバー認証 / 仕様書 F-01）。
 * LIFF SDK は CDN から動的読込みする（依存に固定せず差し替え可能にする）。
 * 取得した ID トークンをサーバー(/api/auth/line)へ送り、Supabase セッションへ交換する。
 */

declare global {
  interface Window {
    liff?: any;
  }
}

const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

async function loadLiffSdk(): Promise<any> {
  if (window.liff) return window.liff;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIFF_SDK_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("LIFF SDK の読込みに失敗しました"));
    document.head.appendChild(s);
  });
  if (!window.liff) throw new Error("LIFF SDK が初期化できません");
  return window.liff;
}

export interface LiffSession {
  idToken: string;
  userId: string;
  displayName?: string;
}

/** LIFF を初期化し、ログイン済みなら ID トークン等を返す。未ログインなら login() へ誘導。 */
export async function initLiff(liffId: string): Promise<LiffSession | null> {
  const liff = await loadLiffSdk();
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login();
    return null; // リダイレクトされる
  }
  const idToken: string | null = liff.getIDToken();
  const profile = await liff.getProfile();
  if (!idToken) return null;
  return {
    idToken,
    userId: profile.userId,
    displayName: profile.displayName,
  };
}
