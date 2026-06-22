/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
