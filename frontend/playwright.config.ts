import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Two isolated servers, started fresh for this run and torn down after:
  // - backend on 4001 against prisma/e2e.db (never dev.db), seeded via
  //   `npm run test:e2e:serve` before it starts listening.
  // - frontend dev server on 5174, proxying to the 4001 backend.
  // The real app on 4000/5173 is never touched.
  webServer: [
    {
      command: "npm run test:e2e:serve",
      cwd: "../backend",
      url: "http://localhost:4001/api/health",
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5174",
      cwd: ".",
      url: "http://localhost:5174",
      timeout: 30_000,
      reuseExistingServer: false,
      env: { VITE_BACKEND_PORT: "4001" },
    },
  ],
});
