import { Hono } from "hono";
import { eq, inArray, and, sql } from "drizzle-orm";
import { PhaseStatus, ProjectStage, Role, Trade } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb, type Db } from "../db/client";
import { projectParticipants, projects, users } from "../db/schema";
import {
  assertProjectOwnership,
  canAccessProject,
  projectTenantFilter,
  requireRole,
} from "../utils-worker/tenantScope";
import type { AppEnv, AuthedUser } from "../worker-env";

// Port of src/routes/projects.ts.
export const projectsRouter = new Hono<AppEnv>();

projectsRouter.use(requireAuth);

const validTrades = Object.values(Trade) as string[];
const validStages = Object.values(ProjectStage) as string[];

const projectWithParticipants = {
  with: { participants: { with: { user: { columns: { id: true, name: true, trade: true } } } } },
} as const;

async function validateParticipants(
  db: Db,
  participants: { trade?: string; userId?: number }[],
  actor: AuthedUser
): Promise<{ error: string; status?: number } | { data: { trade: Trade; userId: number }[] }> {
  if (!Array.isArray(participants) || participants.length > 7) {
    return { error: "participants must be an array of at most 7 entries" };
  }
  for (const p of participants) {
    if (!p.trade || !validTrades.includes(p.trade)) {
      return { error: `participants[].trade must be one of ${validTrades.join(", ")}` };
    }
    if (!p.userId) {
      return { error: "participants[].userId is required" };
    }
  }
  const trades = participants.map((p) => p.trade);
  if (new Set(trades).size !== trades.length) {
    return { error: "participants must not contain duplicate trades" };
  }
  const userIds = participants.map((p) => p.userId!);
  const existingUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, userIds));
  const existingIds = new Set(existingUsers.map((u) => u.id));
  const missing = userIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    return { error: `userId(s) not found: ${missing.join(", ")}` };
  }

  // Cross-tenant leakage guard: an ENTREPRENEUR may only add participants they created.
  if (actor.role === Role.ENTREPRENEUR) {
    const owned = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.createdById, actor.id)));
    const ownedIds = new Set(owned.map((u) => u.id));
    const notOwned = userIds.filter((id) => !ownedIds.has(id));
    if (notOwned.length > 0) {
      return { error: `userId(s) not created by this entrepreneur: ${notOwned.join(", ")}`, status: 403 };
    }
  }

  return { data: participants.map((p) => ({ trade: p.trade! as Trade, userId: p.userId! })) };
}

projectsRouter.get("/", async (c) => {
  const actor = c.get("user");
  const db = createDb(c.env.DB);
  const where = await projectTenantFilter(db, actor);

  const rows = await db.query.projects.findMany({
    where,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: {
      units: {
        with: {
          phases: { orderBy: (ph, { asc }) => [asc(ph.order)] },
        },
      },
    },
  });
  return c.json(rows);
});

projectsRouter.get("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      units: {
        with: {
          phases: {
            orderBy: (ph, { asc }) => [asc(ph.order)],
            with: { subPhases: true },
          },
        },
      },
      participants: { with: { user: { columns: { id: true, name: true, trade: true } } } },
    },
  });
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!(await canAccessProject(db, project, actor))) {
    return c.json({ error: "Not assigned to this project" }, 403);
  }

  return c.json(project);
});

projectsRouter.post("/", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const { name, location, overallStatus, owners, totalBudget, currentStage, participants, entrepreneurId } =
    await c.req.json<{
      name?: string;
      location?: string;
      overallStatus?: string;
      owners?: string;
      totalBudget?: number;
      currentStage?: string;
      participants?: { trade?: string; userId?: number }[];
      entrepreneurId?: number;
    }>();
  if (!name || !location) {
    return c.json({ error: "name and location are required" }, 400);
  }
  if (currentStage && !validStages.includes(currentStage)) {
    return c.json({ error: `currentStage must be one of ${validStages.join(", ")}` }, 400);
  }

  const db = createDb(c.env.DB);

  let resolvedEntrepreneurId: number;
  if (actor.role === Role.ENTREPRENEUR) {
    resolvedEntrepreneurId = actor.id;
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.entrepreneurId, resolvedEntrepreneurId));
    if (existing.length >= 5) {
      return c.json({ error: "הגעת למכסת הפרויקטים המקסימלית (5 פרויקטים)" }, 403);
    }
  } else {
    if (!entrepreneurId) {
      return c.json({ error: "entrepreneurId is required" }, 400);
    }
    const [entrepreneur] = await db.select().from(users).where(eq(users.id, Number(entrepreneurId))).limit(1);
    if (!entrepreneur || entrepreneur.role !== Role.ENTREPRENEUR) {
      return c.json({ error: "entrepreneurId must reference an existing ENTREPRENEUR user" }, 400);
    }
    resolvedEntrepreneurId = entrepreneur.id;
  }

  let participantsData: { trade: Trade; userId: number }[] = [];
  if (participants) {
    const result = await validateParticipants(db, participants, actor);
    if ("error" in result) {
      return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403);
    }
    participantsData = result.data;
  }

  const [created] = await db
    .insert(projects)
    .values({
      name,
      location,
      overallStatus: (overallStatus ?? PhaseStatus.NOT_STARTED) as PhaseStatus,
      owners: owners ?? null,
      totalBudget: totalBudget ?? null,
      currentStage: (currentStage ?? null) as ProjectStage | null,
      entrepreneurId: resolvedEntrepreneurId,
    })
    .returning();

  if (participantsData.length > 0) {
    await db.insert(projectParticipants).values(participantsData.map((p) => ({ ...p, projectId: created.id })));
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, created.id),
    ...projectWithParticipants,
  });
  return c.json(project, 201);
});

projectsRouter.patch("/:id", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }

  const { name, location, overallStatus, owners, totalBudget, currentStage, participants } = await c.req.json<{
    name?: string;
    location?: string;
    overallStatus?: string;
    owners?: string;
    totalBudget?: number;
    currentStage?: string;
    participants?: { trade?: string; userId?: number }[];
  }>();
  if (currentStage && !validStages.includes(currentStage)) {
    return c.json({ error: `currentStage must be one of ${validStages.join(", ")}` }, 400);
  }

  let participantsData: { trade: Trade; userId: number }[] | undefined;
  if (participants !== undefined) {
    const result = await validateParticipants(db, participants, actor);
    if ("error" in result) {
      return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403);
    }
    participantsData = result.data;
  }

  // D1 (including the local Miniflare emulation used by `wrangler dev`) has
  // no interactive-transaction support — Drizzle's `db.transaction()` sends
  // raw BEGIN/COMMIT statements, which D1 rejects ("Failed query: begin"),
  // confirmed against the local binding while porting this route. `db.batch()`
  // is D1's actual atomicity primitive: an array of independent prepared
  // statements executed together, no reads-between-writes. The statements
  // here don't depend on each other's results, so batch is a faithful
  // replacement for the original Prisma `$transaction`. Its type requires a
  // statically non-empty tuple; this batch is dynamic-length by nature
  // (participants only touched when provided), hence the cast below.
  const participantStatements =
    participantsData !== undefined
      ? [
          db.delete(projectParticipants).where(eq(projectParticipants.projectId, id)),
          ...(participantsData.length > 0
            ? [db.insert(projectParticipants).values(participantsData.map((p) => ({ ...p, projectId: id })))]
            : []),
        ]
      : [];
  const updateStatement = db
    .update(projects)
    .set({
      // Self-referential no-op column, always present so the SET clause is
      // never empty when every other field is omitted from the PATCH body —
      // matches Prisma's own generated SQL for an all-undefined `data`
      // object (it always includes at least one column), which D1 requires
      // explicitly since `UPDATE ... SET` with zero columns is invalid SQL.
      id: sql`${projects.id}`,
      name,
      location,
      overallStatus: overallStatus as PhaseStatus | undefined,
      owners,
      totalBudget,
      currentStage: currentStage as ProjectStage | undefined,
    })
    .where(eq(projects.id, id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.batch([...participantStatements, updateStatement] as any);

  const updated = await db.query.projects.findFirst({ where: eq(projects.id, id), ...projectWithParticipants });
  return c.json(updated);
});

projectsRouter.delete("/:id", requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR), async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db.delete(projects).where(eq(projects.id, id));
  return c.body(null, 204);
});
