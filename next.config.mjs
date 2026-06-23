/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDF生成系はバンドルせず実行時に解決（同梱バイナリ/ネイティブのため。Vercelで必須）
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
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
