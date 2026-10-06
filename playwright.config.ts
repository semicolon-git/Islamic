import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);
const executablePath = process.env.PW_CHROMIUM || (require("node:fs").existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const launchOptions = executablePath ? { executablePath } : {};

/**
 * E2E runs against a production build (run `npm run build` first) on a fresh embedded database (DATA_DIR=.data/e2e-<port>),
 * seeded by the webServer command before `next start`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testIgnore: /\.desktop\.spec\.ts$/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions }, testIgnore: /\.mobile\.spec\.ts$/ },
  ],
  webServer: {
    command: `npx tsx scripts/seed.ts --reset && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATA_DIR: `.data/e2e-${PORT}`, UPLOAD_DIR: `.data/e2e-uploads-${PORT}`, DEMO_MODE: "true", ANTHROPIC_API_KEY: "", NODE_ENV: "production", INSECURE_COOKIES: "1", LIBRARY_EDITIONS: "core" },
  },
});
