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
    const records = await prisma.financialRecord.findMany({
      where: { projectId },
      orderBy: { timestamp: "asc" },
    });
    const totals = records.reduce(
      (acc, r) => {
        acc.totalPaid += r.amountPaid;
        acc.totalDue += r.totalDue;
        return acc;
      },
      { totalPaid: 0, totalDue: 0 }
    );
    res.json({ records, totals: { ...totals, remaining: totals.totalDue - totals.totalPaid } });
  })
);

financialRouter.post(
  "/projects/:projectId/financials",
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
    const { phaseId, amountPaid, totalDue } = req.body as {
      phaseId?: string;
      amountPaid?: string;
      totalDue?: string;
    };
    if (totalDue === undefined) {
      res.status(400).json({ error: "totalDue is required" });
      return;
    }
    const record = await prisma.financialRecord.create({
      data: {
        projectId,
        phaseId: phaseId ? Number(phaseId) : null,
        amountPaid: amountPaid ? Number(amountPaid) : 0,
        totalDue: Number(totalDue),
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
