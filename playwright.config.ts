import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a running app. By default they start the existing
 * production build on port 3200 (run `pnpm build` first; it needs
 * DATABASE_URL). Set E2E_BASE_URL to test a deployed URL instead.
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? "http://localhost:3200";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: external
    ? undefined
    : {
        command: "pnpm start -p 3200",
        url: "http://localhost:3200/api/health",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
