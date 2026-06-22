import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env";

/**
 * セッション更新ミドルウェア。各リクエストで Supabase の認証 cookie をリフレッシュする。
 * 併せて未認証アクセスの保護ルーティングをここで行える（/admin, /driver, /office）。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() は毎回トークンを検証する（getSession より安全）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 管理者領域は未認証ならログインへ。ただしログイン画面自身は除外（リダイレクトループ防止）。
  // ドライバーは LIFF 経由のため別扱い。
  const isProtectedAdmin =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  if (isProtectedAdmin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
