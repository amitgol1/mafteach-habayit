import { Router } from "express";
import { Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { publicUploadPath, upload } from "../utils/upload";
import {
  assertProjectOwnership,
  getProjectForPhase,
  getProjectForSubPhase,
  getProjectForUnit,
  requireRole,
} from "../utils/tenantScope";

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
    const { unitId, phaseId, subPhaseId, amountPaid } = req.body as {
      unitId?: string;
      phaseId?: string;
      subPhaseId?: string;
      amountPaid?: string;
    };

    const setCount = [unitId, phaseId, subPhaseId].filter(Boolean).length;
    if (setCount > 1) {
      res.status(400).json({ error: "at most one of unitId, phaseId, or subPhaseId may be set" });
      return;
    }

    let unitIdNum: number | null = null;
    let phaseIdNum: number | null = null;
    let subPhaseIdNum: number | null = null;

    if (unitId) {
      unitIdNum = Number(unitId);
      if (!Number.isFinite(unitIdNum)) {
        res.status(400).json({ error: "unitId must be a number" });
        return;
      }
    }
    if (phaseId) {
      phaseIdNum = Number(phaseId);
      if (!Number.isFinite(phaseIdNum)) {
        res.status(400).json({ error: "phaseId must be a number" });
        return;
      }
    }
    if (subPhaseId) {
      subPhaseIdNum = Number(subPhaseId);
      if (!Number.isFinite(subPhaseIdNum)) {
        res.status(400).json({ error: "subPhaseId must be a number" });
        return;
      }
    }

    if (unitIdNum !== null) {
      const owner = await getProjectForUnit(unitIdNum);
      if (!owner || owner.id !== projectId) {
        res.status(400).json({ error: "unitId does not belong to this project" });
        return;
      }
    }
    if (phaseIdNum !== null) {
      const owner = await getProjectForPhase(phaseIdNum);
      if (!owner || owner.id !== projectId) {
        res.status(400).json({ error: "phaseId does not belong to this project" });
        return;
      }
    }
    if (subPhaseIdNum !== null) {
      const owner = await getProjectForSubPhase(subPhaseIdNum);
      if (!owner || owner.id !== projectId) {
        res.status(400).json({ error: "subPhaseId does not belong to this project" });
        return;
      }
    }

    const record = await prisma.financialRecord.create({
      data: {
        projectId,
        unitId: unitIdNum,
        phaseId: phaseIdNum,
        subPhaseId: subPhaseIdNum,
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
