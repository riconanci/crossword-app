// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing JSON files (word bank)
  // (enabled by default in Next.js 15 with App Router)

  // Make NEXT_PUBLIC_PARTYKIT_HOST available client-side
  // Set in .env.local — no need for rewrites in dev since partykit dev handles cors

  eslint: {
    // Allow production builds with warnings (we'll fix them iteratively)
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
