import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start --port 3100 --hostname localhost",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    // Browser API traffic is intercepted; accidental misses cannot hit a real DB.
    env: { DATABASE_URL: "postgresql://unused@localhost:1/browser_fixture",
      DIRECT_URL: "postgresql://unused@localhost:1/browser_fixture" },
  },
});
