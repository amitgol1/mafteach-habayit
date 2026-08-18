import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { PhaseStatus, ProjectStage, Role } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { phases } from "../db/schema";
import { assertProjectOwnership, getProjectForPhase, getProjectForUnit, requireRole } from "../utils-worker/tenantScope";
import type { AppEnv } from "../worker-env";

// Port of src/routes/phases.ts.
export const phasesRouter = new Hono<AppEnv>();

phasesRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

const validStages = Object.values(ProjectStage) as string[];

phasesRouter.post("/", async (c) => {
  const actor = c.get("user");
  const { unitId, name, order, status } = await c.req.json<{
    unitId?: number;
    name?: string;
    order?: number;
    status?: string;
  }>();
  if (!unitId || !name || order === undefined) {
    return c.json({ error: "unitId, name, order are required" }, 400);
  }
  if (!validStages.includes(name)) {
    return c.json({ error: `name must be one of ${validStages.join(", ")}` }, 400);
  }
  const db = createDb(c.env.DB);
  const project = await getProjectForUnit(db, unitId);
  if (!project) {
    return c.json({ error: "Unit not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const [phase] = await db
    .insert(phases)
    .values({ unitId, name: name as ProjectStage, order, status: (status ?? PhaseStatus.NOT_STARTED) as PhaseStatus })
    .returning();
  return c.json(phase, 201);
});

phasesRouter.patch("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForPhase(db, id);
  if (!project) {
    return c.json({ error: "Phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const { name, order, status } = await c.req.json<{ name?: string; order?: number; status?: string }>();
  if (name !== undefined && !validStages.includes(name)) {
    return c.json({ error: `name must be one of ${validStages.join(", ")}` }, 400);
  }
  // `id` is a self-referential no-op column so the SET clause is never
  // empty when name/order/status are all omitted — see the equivalent
  // guard in routes-worker/projects.ts for why D1 needs this.
  const [phase] = await db
    .update(phases)
    .set({ id: sql`${phases.id}`, name: name as ProjectStage | undefined, order, status: status as PhaseStatus | undefined })
    .where(eq(phases.id, id))
    .returning();
  return c.json(phase);
});

phasesRouter.delete("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForPhase(db, id);
  if (!project) {
    return c.json({ error: "Phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db.delete(phases).where(eq(phases.id, id));
  return c.body(null, 204);
});
