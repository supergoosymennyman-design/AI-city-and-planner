import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 82],
    deviceSizes: [390, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [272, 544],
    minimumCacheTTL: 31_536_000,
  },
  async headers() {
    return [
      {
        source: "/product/:path*.v1.:ext(avif|webp)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/champion/:path*.v4.glb",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/fonts/:path*.woff2",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
