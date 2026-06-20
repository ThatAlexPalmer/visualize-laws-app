import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compiler: {
    // Enable the styled-components SWC transform (SSR, displayName, etc.)
    styledComponents: true,
  },
};

export default nextConfig;
