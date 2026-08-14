import { Router } from "express";
import { PhaseStatus } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";

export const phasesRouter = Router();

phasesRouter.use(requireAuth, requireAdmin);

phasesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { unitId, name, order, status } = req.body as {
      unitId?: number;
      name?: string;
      order?: number;
      status?: string;
    };
    if (!unitId || !name || order === undefined) {
      res.status(400).json({ error: "unitId, name, order are required" });
      return;
    }
    const phase = await prisma.phase.create({
      data: { unitId, name, order, status: status ?? PhaseStatus.NOT_STARTED },
    });
    res.status(201).json(phase);
  })
);

phasesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, order, status } = req.body as { name?: string; order?: number; status?: string };
    const phase = await prisma.phase.update({ where: { id }, data: { name, order, status } });
    res.json(phase);
  })
);

phasesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.phase.delete({ where: { id } });
    res.status(204).send();
  })
);
