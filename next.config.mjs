/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDF生成系はバンドルせず実行時に解決（同梱バイナリ/ネイティブのため。Vercelで必須）
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "exceljs"],
  // @sparticuz/chromium の実体（bin/*.br= chromium本体・日本語含むフォント）は require ではなく
  //   実行時に fs で読むため、既定の file tracing に乗らず Vercel で欠落 → 起動失敗(HTTP 500)になる。
  //   puppeteer/PNG を使う各ルートへ chromium 一式を強制同梱する（これで起動＋日本語描画が復旧）。
  outputFileTracingIncludes: {
    "/api/admin/logiflow/[date]/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/reports/[date]/[driverId]/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/reports/[date]/[driverId]/print": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/daily-reports": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/admin/line/richmenu": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  experimental: {
    // Server Actions のボディ上限（写真アップロードを考慮）
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    // Supabase Storage の署名付きURLを next/image で扱う場合に許可ドメインを追加する。
    // 例: { protocol: "https", hostname: "<project-ref>.supabase.co" }
    remotePatterns: [],
  },
};

export default nextConfig;
