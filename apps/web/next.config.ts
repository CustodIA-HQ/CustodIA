import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
      ".jsx": [".jsx", ".tsx"],
    };
    return config;
  },
  transpilePackages: [
    "@custodia/schema",
    "@custodia/policy",
    "@custodia/graph",
    "@custodia/ens",
    "@custodia/agent",
    "@custodia/db",
  ],
};

export default nextConfig;
