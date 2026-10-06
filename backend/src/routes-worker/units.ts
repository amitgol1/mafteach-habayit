import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { Role } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { projects, units } from "../db/schema";
import { assertProjectOwnership, getProjectForUnit, requireRole } from "../utils-worker/tenantScope";
import type { AppEnv } from "../worker-env";

// Port of src/routes/units.ts.
export const unitsRouter = new Hono<AppEnv>();

unitsRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

unitsRouter.post("/", async (c) => {
  const actor = c.get("user");
  const { projectId, identifier } = await c.req.json<{ projectId?: number; identifier?: string }>();
  if (!projectId || !identifier) {
    return c.json({ error: "projectId and identifier are required" }, 400);
  }
  const db = createDb(c.env.DB);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const [unit] = await db.insert(units).values({ projectId, identifier }).returning();
  return c.json(unit, 201);
});

unitsRouter.post("/bulk", async (c) => {
  const actor = c.get("user");
  const { projectId, identifiers } = await c.req.json<{ projectId?: number; identifiers?: string[] }>();
  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }
  if (
    !Array.isArray(identifiers) ||
    identifiers.length < 1 ||
    identifiers.length > 100 ||
    identifiers.some((i) => typeof i !== "string" || i.trim().length === 0)
  ) {
    return c.json({ error: "identifiers must be an array of 1 to 100 non-empty strings" }, 400);
  }
  const db = createDb(c.env.DB);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  // One INSERT per identifier inside db.batch (D1's atomicity primitive —
  // see routes-worker/projects.ts), not one multi-row INSERT: D1 caps bound
  // parameters per statement at 100, and 100 units x 2 columns exceeds it.
  const inserts = identifiers.map((identifier) =>
    db.insert(units).values({ projectId, identifier: identifier.trim() }).returning()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (await db.batch(inserts as any)) as (typeof units.$inferSelect)[][];
  return c.json(results.map(([unit]) => unit), 201);
});

unitsRouter.patch("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForUnit(db, id);
  if (!project) {
    return c.json({ error: "Unit not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const { identifier } = await c.req.json<{ identifier?: string }>();
  // `id` is a self-referential no-op column so the SET clause is never
  // empty when identifier is omitted — see the equivalent guard in
  // routes-worker/projects.ts for why D1 needs this.
  const [unit] = await db.update(units).set({ id: sql`${units.id}`, identifier }).where(eq(units.id, id)).returning();
  return c.json(unit);
});

unitsRouter.delete("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForUnit(db, id);
  if (!project) {
    return c.json({ error: "Unit not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db.delete(units).where(eq(units.id, id));
  return c.body(null, 204);
});
