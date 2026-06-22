"use client";

/**
 * ルートレイアウト自体の致命的エラー用（html/body を自前で持つ必要がある）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>システムエラー</h1>
        <p style={{ fontSize: 14, color: "#64748b" }}>
          予期しないエラーが発生しました。
          {error.digest ? `（参照: ${error.digest}）` : ""}
        </p>
        <button
          onClick={reset}
          style={{ background: "#0f172a", color: "#fff", padding: "8px 16px", borderRadius: 8, border: 0 }}
        >
          再試行
        </button>
      </body>
    </html>
  );
}
