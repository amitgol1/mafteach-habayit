import { Router } from "express";
import { PhaseStatus, Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { assertProjectOwnership, getProjectForPhase, getProjectForUnit, requireRole } from "../utils/tenantScope";

export const phasesRouter = Router();

phasesRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

phasesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
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
    const project = await getProjectForUnit(unitId);
    if (!project) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
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
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForPhase(id);
    if (!project) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const { name, order, status } = req.body as { name?: string; order?: number; status?: string };
    const phase = await prisma.phase.update({ where: { id }, data: { name, order, status } });
    res.json(phase);
  })
);

phasesRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForPhase(id);
    if (!project) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.phase.delete({ where: { id } });
    res.status(204).send();
  })
);
