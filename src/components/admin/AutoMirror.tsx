"use client";

import { useEffect, useRef } from "react";

const INTERVAL_MS = 5 * 60 * 1000; // 5分

/**
 * 管理画面を開いている間、5分ごとに現行スプレッドシートの取り込み(ミラー)を起動する。
 *   GitHub Actions の高頻度スケジュールは間引かれ不安定なため、事務所モニター常時表示の運用で
 *   確実に反映させる保険。サーバ側スロットル(mirror_state)で多重起動は抑制されるので、複数タブ/
 *   端末で開いても、GitHub と重なっても二重取り込みにならない。
 *   ここでは取り込み(シート→DB)を起動するだけ。画面表示は各盤面の既存 Realtime/ポーリングが
 *   （編集中はガードして）反映する。管理レイアウトに置くためページ遷移では再マウントされず、
 *   1本のタイマーで回る。ログイン画面など未認証時は 401 になるが握りつぶす（次周期で再試行）。
 */
export function AutoMirror() {
  const busy = useRef(false);
  useEffect(() => {
    async function run() {
      if (busy.current) return;
      busy.current = true;
      try {
        await fetch("/api/admin/mirror", { method: "POST" });
      } catch {
        /* 取り込み失敗は無視（次周期で再試行） */
      } finally {
        busy.current = false;
      }
    }
    run(); // 開いた直後に一度
    const iv = setInterval(run, INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);
  return null;
}
