import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/export-keihicho が読み込む経費帳テンプレート(xlsx)をVercelの
  // サーバーレス関数バンドルに含める（fsで直接読むファイルは自動検出されないため明示指定）
  outputFileTracingIncludes: {
    "/api/export-keihicho/route": ["./templates/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
