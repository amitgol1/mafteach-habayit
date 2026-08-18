import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { PhaseStatus, Role } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { phaseAssignments, subPhases, users } from "../db/schema";
import {
  assertProjectOwnership,
  canAccessProject,
  getProjectForPhase,
  getProjectForSubPhase,
  requireRole,
} from "../utils-worker/tenantScope";
import type { AppEnv } from "../worker-env";

// Port of src/routes/subPhases.ts.
export const subPhasesRouter = new Hono<AppEnv>();

subPhasesRouter.use(requireAuth);

subPhasesRouter.get("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const [subPhase] = await db.select().from(subPhases).where(eq(subPhases.id, id)).limit(1);
  if (!subPhase) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  const project = await getProjectForSubPhase(db, id);
  if (actor.role === Role.COLLABORATOR) {
    if (!project || !(await canAccessProject(db, project, actor))) {
      return c.json({ error: "Not assigned to this sub-phase" }, 403);
    }
  } else if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not assigned to this sub-phase" }, 403);
  }
  return c.json(subPhase);
});

subPhasesRouter.post("/", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const { phaseId, name, status } = await c.req.json<{ phaseId?: number; name?: string; status?: string }>();
  if (!phaseId || !name) {
    return c.json({ error: "phaseId and name are required" }, 400);
  }
  const db = createDb(c.env.DB);
  const project = await getProjectForPhase(db, phaseId);
  if (!project) {
    return c.json({ error: "Phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const [subPhase] = await db
    .insert(subPhases)
    .values({ phaseId, name, status: (status ?? PhaseStatus.NOT_STARTED) as PhaseStatus })
    .returning();
  return c.json(subPhase, 201);
});

subPhasesRouter.patch("/:id", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForSubPhase(db, id);
  if (!project) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const { name, status } = await c.req.json<{ name?: string; status?: string }>();
  // `id` is a self-referential no-op column so the SET clause is never
  // empty when name/status are both omitted — see the equivalent guard in
  // routes-worker/projects.ts for why D1 needs this.
  const [subPhase] = await db
    .update(subPhases)
    .set({ id: sql`${subPhases.id}`, name, status: status as PhaseStatus | undefined })
    .where(eq(subPhases.id, id))
    .returning();
  return c.json(subPhase);
});

subPhasesRouter.delete("/:id", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const project = await getProjectForSubPhase(db, id);
  if (!project) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db.delete(subPhases).where(eq(subPhases.id, id));
  return c.body(null, 204);
});

subPhasesRouter.post("/:id/assignments", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const subPhaseId = Number(c.req.param("id"));
  const { userId } = await c.req.json<{ userId?: number }>();
  if (!userId) {
    return c.json({ error: "userId is required" }, 400);
  }
  const db = createDb(c.env.DB);
  const project = await getProjectForSubPhase(db, subPhaseId);
  if (!project) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }

  // Cross-tenant leakage guard: an ENTREPRENEUR may only assign users they created.
  if (actor.role === Role.ENTREPRENEUR) {
    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser || targetUser.createdById !== actor.id) {
      return c.json({ error: "Cannot assign a user you did not create" }, 403);
    }
  }

  const [assignment] = await db.insert(phaseAssignments).values({ userId, subPhaseId }).returning();
  return c.json(assignment, 201);
});

subPhasesRouter.delete("/:id/assignments/:userId", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const subPhaseId = Number(c.req.param("id"));
  const userId = Number(c.req.param("userId"));
  const db = createDb(c.env.DB);
  const project = await getProjectForSubPhase(db, subPhaseId);
  if (!project) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db
    .delete(phaseAssignments)
    .where(and(eq(phaseAssignments.userId, userId), eq(phaseAssignments.subPhaseId, subPhaseId)));
  return c.body(null, 204);
});
