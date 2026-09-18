import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The parent repository has its own lockfile; keep file tracing scoped to this app.
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["@react-pdf/renderer", "@prisma/client"],
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
