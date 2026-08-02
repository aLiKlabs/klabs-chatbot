import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["mammoth", "pdf-parse"],
};

export default nextConfig;
