import { Router } from "express";
import { Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { publicUploadPath, upload } from "../utils/upload";
import { assertProjectOwnership, requireRole } from "../utils/tenantScope";

export const financialRouter = Router();

financialRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

financialRouter.get(
  "/projects/:projectId/financials",
  asyncHandler(async (req: AuthedRequest, res) => {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { totalBudget: true, entrepreneurId: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const records = await prisma.financialRecord.findMany({
      where: { projectId },
      orderBy: { timestamp: "asc" },
    });
    const totalDue = project.totalBudget ?? 0;
    const totalPaid = records.reduce((sum, r) => sum + r.amountPaid, 0);
    res.json({ records, totals: { totalDue, totalPaid, remaining: totalDue - totalPaid } });
  })
);

financialRouter.post(
  "/projects/:projectId/financials",
  upload.single("receipt"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { entrepreneurId: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const { phaseId, amountPaid } = req.body as {
      phaseId?: string;
      amountPaid?: string;
    };
    const record = await prisma.financialRecord.create({
      data: {
        projectId,
        phaseId: phaseId ? Number(phaseId) : null,
        amountPaid: amountPaid ? Number(amountPaid) : 0,
        receiptMediaUrl: req.file ? publicUploadPath(req.file.filename) : null,
      },
    });
    res.status(201).json(record);
  })
);

financialRouter.delete(
  "/financial-records/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const record = await prisma.financialRecord.findUnique({
      where: { id },
      include: { project: { select: { entrepreneurId: true } } },
    });
    if (!record) {
      res.status(404).json({ error: "Financial record not found" });
      return;
    }
    if (!assertProjectOwnership(record.project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.financialRecord.delete({ where: { id } });
    res.status(204).send();
  })
);
