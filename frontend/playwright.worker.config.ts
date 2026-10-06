import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Same suite as playwright.config.ts, but the isolated backend on 4001 is the
// Cloudflare Worker (`wrangler dev`, local D1/KV under backend/.wrangler/e2e)
// instead of Express. Seed data is the same prisma/e2e.db, copied into D1 by
// src/db/import-from-prisma.ts — which also exercises that import script.
export default defineConfig({
  ...base,
  webServer: [
    {
      command: "npm run test:e2e:worker:serve",
      cwd: "../backend",
      url: "http://localhost:4001/api/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    (base.webServer as NonNullable<typeof base.webServer>[])[1] as never,
  ],
});
