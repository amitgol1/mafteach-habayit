import { defineConfig } from "drizzle-kit";

// Only used to `drizzle-kit generate` SQL migration files from src/db/schema.ts.
// Applying them to D1 (local or remote) goes through wrangler's own migration
// runner (`wrangler d1 migrations apply`), not drizzle-kit — see backend
// README / team-lead notes for the Cloudflare POC. `out` matches wrangler's
// default `migrations_dir` ("./migrations") so no extra wrangler.jsonc
// config is needed.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
