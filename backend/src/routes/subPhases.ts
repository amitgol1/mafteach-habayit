import { Router } from "express";
import { PhaseStatus } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { isAssignedToSubPhase } from "../utils/subPhaseAccess";

export const subPhasesRouter = Router();

subPhasesRouter.use(requireAuth);

subPhasesRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const subPhase = await prisma.subPhase.findUnique({ where: { id } });
    if (!subPhase) {
      res.status(404).json({ error: "Sub-phase not found" });
      return;
    }
    if (req.user!.role !== "ADMIN" && !(await isAssignedToSubPhase(req.user!.id, id))) {
      res.status(403).json({ error: "Not assigned to this sub-phase" });
      return;
    }
    res.json(subPhase);
  })
);

subPhasesRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { phaseId, name, status } = req.body as { phaseId?: number; name?: string; status?: string };
    if (!phaseId || !name) {
      res.status(400).json({ error: "phaseId and name are required" });
      return;
    }
    const subPhase = await prisma.subPhase.create({
      data: { phaseId, name, status: status ?? PhaseStatus.NOT_STARTED },
    });
    res.status(201).json(subPhase);
  })
);

subPhasesRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, status } = req.body as { name?: string; status?: string };
    const subPhase = await prisma.subPhase.update({ where: { id }, data: { name, status } });
    res.json(subPhase);
  })
);

subPhasesRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.subPhase.delete({ where: { id } });
    res.status(204).send();
  })
);

subPhasesRouter.post(
  "/:id/assignments",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const subPhaseId = Number(req.params.id);
    const { userId } = req.body as { userId?: number };
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const assignment = await prisma.phaseAssignment.create({ data: { userId, subPhaseId } });
    res.status(201).json(assignment);
  })
);

subPhasesRouter.delete(
  "/:id/assignments/:userId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const subPhaseId = Number(req.params.id);
    const userId = Number(req.params.userId);
    await prisma.phaseAssignment.delete({ where: { userId_subPhaseId: { userId, subPhaseId } } });
    res.status(204).send();
  })
);
