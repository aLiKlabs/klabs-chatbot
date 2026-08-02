import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["mammoth", "pdf-parse"],
};

export default nextConfig;
