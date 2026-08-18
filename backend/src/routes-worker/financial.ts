import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { Role } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { financialRecords, projects } from "../db/schema";
import { assertProjectOwnership, requireRole } from "../utils-worker/tenantScope";
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
  const phaseId = typeof body.phaseId === "string" ? body.phaseId : undefined;
  const amountPaid = typeof body.amountPaid === "string" ? body.amountPaid : undefined;
  const file = body.receipt instanceof File && body.receipt.size > 0 ? body.receipt : undefined;

  let receiptMediaUrl: string | null = null;
  if (file) {
    try {
      const stored = await storeUpload(c.env.UPLOADS_BUCKET, file);
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
      phaseId: phaseId ? Number(phaseId) : null,
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
