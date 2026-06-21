import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The Next.js app lives in `app/`, but the canonical `.env` lives at the repo
// root (shared with the seed + Prisma CLI). Next only auto-loads env from its
// own project dir, so load the root `.env` here into process.env. In Docker the
// vars come from compose `environment:` and are left untouched.
function loadRootEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compiler: {
    // styled-components SWC transform (SSR, displayName, etc.)
    styledComponents: true,
  },
  // Allow importing the sibling /server and /data source folders.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
