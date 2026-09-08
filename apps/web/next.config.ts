import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
