import { Router } from "express";
import { Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { assertProjectOwnership, getProjectForUnit, requireRole } from "../utils/tenantScope";

export const unitsRouter = Router();

unitsRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

unitsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { projectId, identifier } = req.body as { projectId?: number; identifier?: string };
    if (!projectId || !identifier) {
      res.status(400).json({ error: "projectId and identifier are required" });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const unit = await prisma.unit.create({ data: { projectId, identifier } });
    res.status(201).json(unit);
  })
);

unitsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForUnit(id);
    if (!project) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const { identifier } = req.body as { identifier?: string };
    const unit = await prisma.unit.update({ where: { id }, data: { identifier } });
    res.json(unit);
  })
);

unitsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForUnit(id);
    if (!project) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.unit.delete({ where: { id } });
    res.status(204).send();
  })
);
