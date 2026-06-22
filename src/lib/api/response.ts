import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

/**
 * API 共通レスポンス（仕様書 8.2 のレスポンス形式に準拠）。
 *   成功: { success: true, ... }
 *   失敗: { success: false, error }
 */
export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

/** ルートハンドラを包んで、AuthError / ZodError / 例外を一貫処理する。 */
export function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return fn().catch((e: unknown) => {
    if (e instanceof AppError) return fail(e.message, e.status);
    if (e instanceof ZodError) {
      return fail(
        "入力が不正です: " + e.issues.map((i) => i.message).join(", "),
        422,
      );
    }
    console.error("[api] unhandled error", e);
    return fail("サーバーエラーが発生しました", 500);
  });
}

/** 未実装エンドポイントの明示マーカー（黙って成功に見せない / 仕様書方針）。 */
export function notImplemented(detail: string) {
  return NextResponse.json(
    { success: false, error: "未実装", detail },
    { status: 501 },
  );
}
