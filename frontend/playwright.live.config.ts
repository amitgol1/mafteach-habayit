import { defineConfig, devices } from "@playwright/test";
import { loadLiveEnv } from "./e2e-live/helpers/env";

// Runs against the LIVE Cloudflare deployment, so there is deliberately no
// webServer. loadLiveEnv() throws if e2e-live/.env is missing or incomplete.
const env = loadLiveEnv();

export default defineConfig({
  testDir: "./e2e-live",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Own subdirectory: Playwright wipes outputDir at the start of every run,
  // and the registry of created records (used for crash cleanup) must survive.
  outputDir: "test-results/live-artifacts",
  globalSetup: "./e2e-live/global-setup.ts",
  globalTeardown: "./e2e-live/global-teardown.ts",
  reporter: [["list"], ["json", { outputFile: "test-results/live-report.json" }]],
  use: {
    baseURL: env.LIVE_BASE_URL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
