import "@upstand/env/web";
import crypto from "node:crypto";
import type { NextConfig } from "next";

class SafeSha256 {
  private hash = crypto.createHash("sha256");

  update(data: any, encoding?: any) {
    if (data !== undefined) {
      this.hash.update(data, encoding);
    }
    return this;
  }

  digest(encoding: any) {
    return this.hash.digest(encoding);
  }
}

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPECHECK === "1" || process.env.SKIP_TYPECHECK === "true",
  },
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  devIndicators: false,
  webpack: (config) => {
    config.output.hashFunction = SafeSha256;
    return config;
  },
};

export default nextConfig;
