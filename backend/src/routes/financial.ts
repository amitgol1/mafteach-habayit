import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { publicUploadPath, upload } from "../utils/upload";

export const financialRouter = Router();

financialRouter.use(requireAuth, requireAdmin);

financialRouter.get(
  "/projects/:projectId/financials",
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { totalBudget: true },
    });
    const records = await prisma.financialRecord.findMany({
      where: { projectId },
      orderBy: { timestamp: "asc" },
    });
    const totalDue = project?.totalBudget ?? 0;
    const totalPaid = records.reduce((sum, r) => sum + r.amountPaid, 0);
    res.json({ records, totals: { totalDue, totalPaid, remaining: totalDue - totalPaid } });
  })
);

financialRouter.post(
  "/projects/:projectId/financials",
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
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
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.financialRecord.delete({ where: { id } });
    res.status(204).send();
  })
);
