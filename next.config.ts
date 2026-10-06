import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/wasm packages must not be bundled by webpack.
  serverExternalPackages: ["@electric-sql/pglite", "tesseract.js", "sharp", "pg", "pdfjs-dist", "pdf-lib"],
  poweredByHeader: false,
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
