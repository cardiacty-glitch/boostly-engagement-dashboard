import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sync scripts in /sync are Node.js-only; exclude them from the Next.js build.
  serverExternalPackages: ["pg", "@hubspot/api-client"],
};

export default nextConfig;
