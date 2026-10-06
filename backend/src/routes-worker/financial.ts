import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { Role } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { financialRecords, projects } from "../db/schema";
import {
  assertProjectOwnership,
  getProjectForPhase,
  getProjectForSubPhase,
  getProjectForUnit,
  requireRole,
} from "../utils-worker/tenantScope";
import { FileTooLargeError, UnsupportedFileTypeError, storeUpload } from "../utils-worker/upload";
import type { AppEnv } from "../worker-env";

// Port of src/routes/financial.ts.
export const financialRouter = new Hono<AppEnv>();

financialRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

financialRouter.get("/projects/:projectId/financials", async (c) => {
  const actor = c.get("user");
  const projectId = Number(c.req.param("projectId"));
  const db = createDb(c.env.DB);
  const [project] = await db
    .select({ totalBudget: projects.totalBudget, entrepreneurId: projects.entrepreneurId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  const records = await db
    .select()
    .from(financialRecords)
    .where(eq(financialRecords.projectId, projectId))
    .orderBy(asc(financialRecords.timestamp));
  const totalDue = project.totalBudget ?? 0;
  const totalPaid = records.reduce((sum, r) => sum + r.amountPaid, 0);
  return c.json({ records, totals: { totalDue, totalPaid, remaining: totalDue - totalPaid } });
});

financialRouter.post("/projects/:projectId/financials", async (c) => {
  const actor = c.get("user");
  const projectId = Number(c.req.param("projectId"));
  const db = createDb(c.env.DB);
  const [project] = await db
    .select({ entrepreneurId: projects.entrepreneurId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!assertProjectOwnership(project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }

  const body = await c.req.parseBody();
  const unitId = typeof body.unitId === "string" ? body.unitId : undefined;
  const phaseId = typeof body.phaseId === "string" ? body.phaseId : undefined;
  const subPhaseId = typeof body.subPhaseId === "string" ? body.subPhaseId : undefined;
  const amountPaid = typeof body.amountPaid === "string" ? body.amountPaid : undefined;
  const file = body.receipt instanceof File && body.receipt.size > 0 ? body.receipt : undefined;

  const setCount = [unitId, phaseId, subPhaseId].filter(Boolean).length;
  if (setCount > 1) {
    return c.json({ error: "at most one of unitId, phaseId, or subPhaseId may be set" }, 400);
  }

  const links = [
    { name: "unitId", raw: unitId, resolveProject: getProjectForUnit },
    { name: "phaseId", raw: phaseId, resolveProject: getProjectForPhase },
    { name: "subPhaseId", raw: subPhaseId, resolveProject: getProjectForSubPhase },
  ];
  const linkIds: Record<string, number | null> = { unitId: null, phaseId: null, subPhaseId: null };
  for (const link of links) {
    if (!link.raw) continue;
    const num = Number(link.raw);
    if (!Number.isFinite(num)) {
      return c.json({ error: `${link.name} must be a number` }, 400);
    }
    const owner = await link.resolveProject(db, num);
    if (!owner || owner.id !== projectId) {
      return c.json({ error: `${link.name} does not belong to this project` }, 400);
    }
    linkIds[link.name] = num;
  }

  let receiptMediaUrl: string | null = null;
  if (file) {
    try {
      const stored = await storeUpload(c.env.UPLOADS_KV, file);
      receiptMediaUrl = stored.url;
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError) return c.json({ error: err.message }, 400);
      if (err instanceof FileTooLargeError) return c.json({ error: err.message }, 400);
      throw err;
    }
  }

  const [record] = await db
    .insert(financialRecords)
    .values({
      projectId,
      unitId: linkIds.unitId,
      phaseId: linkIds.phaseId,
      subPhaseId: linkIds.subPhaseId,
      amountPaid: amountPaid ? Number(amountPaid) : 0,
      receiptMediaUrl,
    })
    .returning();
  return c.json(record, 201);
});

financialRouter.delete("/financial-records/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const record = await db.query.financialRecords.findFirst({
    where: eq(financialRecords.id, id),
    with: { project: { columns: { entrepreneurId: true } } },
  });
  if (!record) {
    return c.json({ error: "Financial record not found" }, 404);
  }
  if (!assertProjectOwnership(record.project, actor)) {
    return c.json({ error: "Not authorized for this project" }, 403);
  }
  await db.delete(financialRecords).where(eq(financialRecords.id, id));
  return c.body(null, 204);
});
