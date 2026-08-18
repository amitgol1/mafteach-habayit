import { Hono } from "hono";
import { authRouter } from "./routes-worker/auth";
import { usersRouter } from "./routes-worker/users";
import { projectsRouter } from "./routes-worker/projects";
import { unitsRouter } from "./routes-worker/units";
import { phasesRouter } from "./routes-worker/phases";
import { subPhasesRouter } from "./routes-worker/subPhases";
import { updatesRouter } from "./routes-worker/updates";
import { financialRouter } from "./routes-worker/financial";
import { uploadsRouter } from "./routes-worker/uploads";
import { UnsupportedFileTypeError, FileTooLargeError } from "./utils-worker/upload";
import type { AppEnv } from "./worker-env";

// Cloudflare POC entry point — parallel to src/index.ts (Express), not a
// replacement. Run with `npm run dev:worker`. Bindings are declared in
// wrangler.jsonc; types come from `npm run types:worker` (generates
// worker-configuration.d.ts, gitignored, regenerate after editing bindings).
// JWT_SECRET is a plain-text var for this local-only POC, supplied via
// `.dev.vars` (gitignored, mirrors the Express app's `.env`/JWT_SECRET) —
// see `.dev.vars.example`.
const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", authRouter);
app.route("/api/users", usersRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/units", unitsRouter);
app.route("/api/phases", phasesRouter);
app.route("/api/sub-phases", subPhasesRouter);
app.route("/api", updatesRouter);
app.route("/api", financialRouter);
app.route("/uploads", uploadsRouter);

app.onError((err, c) => {
  if (err instanceof UnsupportedFileTypeError || err instanceof FileTooLargeError) {
    return c.json({ error: err.message }, 400);
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

export default app;
