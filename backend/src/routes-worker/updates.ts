import { Hono } from "hono";
import type { Context, Next } from "hono";
import { and, eq, lt, type SQL } from "drizzle-orm";
import { Role, type MediaType } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb, type Db } from "../db/client";
import { projects, updates } from "../db/schema";
import { isAssignedToSubPhase } from "../utils-worker/subPhaseAccess";
import { assertProjectOwnership, canAccessProject, getProjectForSubPhase } from "../utils-worker/tenantScope";
import { FileTooLargeError, UnsupportedFileTypeError, storeUpload } from "../utils-worker/upload";
import type { AppEnv } from "../worker-env";

// Port of src/routes/updates.ts.
export const updatesRouter = new Hono<AppEnv>();

updatesRouter.use(requireAuth);

const DEFAULT_PAGE_LIMIT = 10;
const MIN_PAGE_LIMIT = 1;
const MAX_PAGE_LIMIT = 50;

function parsePageLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(MIN_PAGE_LIMIT, Math.trunc(parsed)));
}

function parseBeforeCursor(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && !Number.isNaN(parsed) ? Math.trunc(parsed) : undefined;
}

async function fetchUpdatesPage(db: Db, whereBase: SQL, before: string | undefined, limitRaw: string | undefined) {
  const limit = parsePageLimit(limitRaw);
  const beforeId = parseBeforeCursor(before);
  const where = beforeId !== undefined ? and(whereBase, lt(updates.id, beforeId)) : whereBase;
  const rows = await db.query.updates.findMany({
    where,
    orderBy: (u, { desc }) => [desc(u.id)],
    limit: limit + 1,
    with: { user: { columns: { id: true, name: true, role: true, trade: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { updates: page, nextCursor, hasMore };
}

// Write gate (posting an update): a COLLABORATOR must be assigned to this
// specific sub-phase — seeing the project tree doesn't grant posting rights
// to sub-phases outside what they're actually responsible for.
async function requireSubPhaseAccess(c: Context<AppEnv>, next: Next) {
  const actor = c.get("user");
  const subPhaseId = Number(c.req.param("subPhaseId"));
  const db = createDb(c.env.DB);
  if (actor.role === Role.SUPER_ADMIN) {
    await next();
    return;
  }
  if (actor.role === Role.ENTREPRENEUR) {
    const project = await getProjectForSubPhase(db, subPhaseId);
    if (assertProjectOwnership(project, actor)) {
      await next();
      return;
    }
    return c.json({ error: "Not assigned to this sub-phase" }, 403);
  }
  if (!(await isAssignedToSubPhase(db, actor.id, subPhaseId))) {
    return c.json({ error: "Not assigned to this sub-phase" }, 403);
  }
  await next();
}

// View gate (reading a feed): any user with project-level access (via
// ProjectParticipant or any assignment within the project) can view every
// sub-phase's feed, not just the ones they're personally assigned to.
async function requireSubPhaseViewAccess(c: Context<AppEnv>, next: Next) {
  const actor = c.get("user");
  const subPhaseId = Number(c.req.param("subPhaseId"));
  const db = createDb(c.env.DB);
  const project = await getProjectForSubPhase(db, subPhaseId);
  if (!project) {
    return c.json({ error: "Sub-phase not found" }, 404);
  }
  if (!(await canAccessProject(db, project, actor))) {
    return c.json({ error: "Not assigned to this project" }, 403);
  }
  await next();
}

async function requireProjectAccess(c: Context<AppEnv>, next: Next) {
  const actor = c.get("user");
  const projectId = Number(c.req.param("projectId"));
  const db = createDb(c.env.DB);
  const [project] = await db
    .select({ id: projects.id, entrepreneurId: projects.entrepreneurId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!(await canAccessProject(db, project, actor))) {
    return c.json({ error: "Not assigned to this project" }, 403);
  }
  await next();
}

updatesRouter.get("/sub-phases/:subPhaseId/updates", requireSubPhaseViewAccess, async (c) => {
  const subPhaseId = Number(c.req.param("subPhaseId"));
  const db = createDb(c.env.DB);
  const page = await fetchUpdatesPage(db, eq(updates.subPhaseId, subPhaseId), c.req.query("before"), c.req.query("limit"));
  return c.json(page);
});

updatesRouter.post("/sub-phases/:subPhaseId/updates", requireSubPhaseAccess, async (c) => {
  const actor = c.get("user");
  const subPhaseId = Number(c.req.param("subPhaseId"));
  const body = await c.req.parseBody();
  const subject = typeof body.subject === "string" ? body.subject : undefined;
  const description = typeof body.description === "string" ? body.description : undefined;
  const file = body.media instanceof File && body.media.size > 0 ? body.media : undefined;
  if (!subject?.trim() && !description?.trim() && !file) {
    return c.json({ error: "subject, description or media file is required" }, 400);
  }

  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;
  if (file) {
    try {
      const stored = await storeUpload(c.env.UPLOADS_BUCKET, file);
      mediaUrl = stored.url;
      mediaType = stored.mediaType;
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError) return c.json({ error: err.message }, 400);
      if (err instanceof FileTooLargeError) return c.json({ error: err.message }, 400);
      throw err;
    }
  }

  const db = createDb(c.env.DB);
  const [created] = await db
    .insert(updates)
    .values({
      subPhaseId,
      userId: actor.id,
      subject: subject ?? null,
      description: description ?? null,
      mediaUrl,
      mediaType,
    })
    .returning();
  const update = await db.query.updates.findFirst({
    where: eq(updates.id, created.id),
    with: { user: { columns: { id: true, name: true, role: true, trade: true } } },
  });
  return c.json(update, 201);
});

updatesRouter.get("/projects/:projectId/updates", requireProjectAccess, async (c) => {
  const projectId = Number(c.req.param("projectId"));
  const db = createDb(c.env.DB);
  const page = await fetchUpdatesPage(db, eq(updates.projectId, projectId), c.req.query("before"), c.req.query("limit"));
  return c.json(page);
});

updatesRouter.post("/projects/:projectId/updates", requireProjectAccess, async (c) => {
  const actor = c.get("user");
  const projectId = Number(c.req.param("projectId"));
  const body = await c.req.parseBody();
  const subject = typeof body.subject === "string" ? body.subject : undefined;
  const description = typeof body.description === "string" ? body.description : undefined;
  const file = body.media instanceof File && body.media.size > 0 ? body.media : undefined;
  if (!subject?.trim() && !description?.trim() && !file) {
    return c.json({ error: "subject, description or media file is required" }, 400);
  }

  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;
  if (file) {
    try {
      const stored = await storeUpload(c.env.UPLOADS_BUCKET, file);
      mediaUrl = stored.url;
      mediaType = stored.mediaType;
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError) return c.json({ error: err.message }, 400);
      if (err instanceof FileTooLargeError) return c.json({ error: err.message }, 400);
      throw err;
    }
  }

  const db = createDb(c.env.DB);
  const [created] = await db
    .insert(updates)
    .values({
      projectId,
      userId: actor.id,
      subject: subject ?? null,
      description: description ?? null,
      mediaUrl,
      mediaType,
    })
    .returning();
  const update = await db.query.updates.findFirst({
    where: eq(updates.id, created.id),
    with: { user: { columns: { id: true, name: true, role: true, trade: true } } },
  });
  return c.json(update, 201);
});
