import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repo root has its own lockfile from the original app; pin the workspace root here.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
