import { Router } from "express";
import { PhaseStatus, Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import {
  assertProjectOwnership,
  canAccessProject,
  getProjectForPhase,
  getProjectForSubPhase,
  requireRole,
} from "../utils/tenantScope";

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
    const project = await getProjectForSubPhase(id);
    if (req.user!.role === Role.COLLABORATOR) {
      if (!project || !(await canAccessProject(project, req.user!))) {
        res.status(403).json({ error: "Not assigned to this sub-phase" });
        return;
      }
    } else if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not assigned to this sub-phase" });
      return;
    }
    res.json(subPhase);
  })
);

subPhasesRouter.post(
  "/",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { phaseId, name, status } = req.body as { phaseId?: number; name?: string; status?: string };
    if (!phaseId || !name) {
      res.status(400).json({ error: "phaseId and name are required" });
      return;
    }
    const project = await getProjectForPhase(phaseId);
    if (!project) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
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
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForSubPhase(id);
    if (!project) {
      res.status(404).json({ error: "Sub-phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const { name, status } = req.body as { name?: string; status?: string };
    const subPhase = await prisma.subPhase.update({ where: { id }, data: { name, status } });
    res.json(subPhase);
  })
);

subPhasesRouter.delete(
  "/:id",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await getProjectForSubPhase(id);
    if (!project) {
      res.status(404).json({ error: "Sub-phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.subPhase.delete({ where: { id } });
    res.status(204).send();
  })
);

subPhasesRouter.post(
  "/:id/assignments",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subPhaseId = Number(req.params.id);
    const { userId } = req.body as { userId?: number };
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const project = await getProjectForSubPhase(subPhaseId);
    if (!project) {
      res.status(404).json({ error: "Sub-phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    // Cross-tenant leakage guard: an ENTREPRENEUR may only assign users they created.
    if (req.user!.role === Role.ENTREPRENEUR) {
      const targetUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!targetUser || targetUser.createdById !== req.user!.id) {
        res.status(403).json({ error: "Cannot assign a user you did not create" });
        return;
      }
    }

    const assignment = await prisma.phaseAssignment.create({ data: { userId, subPhaseId } });
    res.status(201).json(assignment);
  })
);

subPhasesRouter.delete(
  "/:id/assignments/:userId",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subPhaseId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const project = await getProjectForSubPhase(subPhaseId);
    if (!project) {
      res.status(404).json({ error: "Sub-phase not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.phaseAssignment.delete({ where: { userId_subPhaseId: { userId, subPhaseId } } });
    res.status(204).send();
  })
);
