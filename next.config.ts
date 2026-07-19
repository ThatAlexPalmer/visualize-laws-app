import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` and `next build` produce incompatible chunk graphs. Keeping
  // their output separate prevents a production validation build from
  // corrupting the active hot-reload server (missing chunks, failed hydration,
  // fallback fonts, and permanently loading client panels).
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  compiler: {
    // styled-components SWC transform (SSR, displayName, etc.)
    styledComponents: true,
  },
};

export default nextConfig;
