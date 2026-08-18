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
