import { Router } from "express";
import { PhaseStatus, ProjectStage, Role, Trade } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { getAssignedSubPhaseIds } from "../utils/subPhaseAccess";
import { assertProjectOwnership, canAccessProject, projectTenantFilter, requireRole } from "../utils/tenantScope";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

const validTrades = Object.values(Trade) as string[];
const validStages = Object.values(ProjectStage) as string[];

const participantInclude = {
  participants: { include: { user: { select: { id: true, name: true, trade: true } } } },
} as const;

async function validateParticipants(
  participants: { trade?: string; userId?: number }[],
  actor: { id: number; role: string }
): Promise<{ error: string; status?: number } | { data: { trade: string; userId: number }[] }> {
  if (!Array.isArray(participants) || participants.length > 7) {
    return { error: "participants must be an array of at most 7 entries" };
  }
  for (const p of participants) {
    if (!p.trade || !validTrades.includes(p.trade)) {
      return { error: `participants[].trade must be one of ${validTrades.join(", ")}` };
    }
    if (!p.userId) {
      return { error: "participants[].userId is required" };
    }
  }
  const trades = participants.map((p) => p.trade);
  if (new Set(trades).size !== trades.length) {
    return { error: "participants must not contain duplicate trades" };
  }
  const userIds = participants.map((p) => p.userId!);
  const existingUsers = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
  const existingIds = new Set(existingUsers.map((u) => u.id));
  const missing = userIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    return { error: `userId(s) not found: ${missing.join(", ")}` };
  }

  // Cross-tenant leakage guard: an ENTREPRENEUR may only add participants they created.
  if (actor.role === Role.ENTREPRENEUR) {
    const owned = await prisma.user.findMany({
      where: { id: { in: userIds }, createdById: actor.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((u) => u.id));
    const notOwned = userIds.filter((id) => !ownedIds.has(id));
    if (notOwned.length > 0) {
      return { error: `userId(s) not created by this entrepreneur: ${notOwned.join(", ")}`, status: 403 };
    }
  }

  return { data: participants.map((p) => ({ trade: p.trade!, userId: p.userId! })) };
}

projectsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const where = await projectTenantFilter(req.user!);

    if (req.user!.role === Role.COLLABORATOR) {
      const subPhaseIds = await getAssignedSubPhaseIds(req.user!.id);
      const projects = await prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          units: {
            include: {
              phases: {
                orderBy: { order: "asc" },
                include: { subPhases: { where: { id: { in: subPhaseIds } } } },
              },
            },
          },
        },
      });
      res.json(projects);
      return;
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { units: { include: { phases: { orderBy: { order: "asc" } } } } },
    });
    res.json(projects);
  })
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        units: { include: { phases: { orderBy: { order: "asc" }, include: { subPhases: true } } } },
        ...participantInclude,
      },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (!(await canAccessProject(project, req.user!))) {
      res.status(403).json({ error: "Not assigned to this project" });
      return;
    }

    if (req.user!.role === Role.COLLABORATOR) {
      const subPhaseIds = new Set(await getAssignedSubPhaseIds(req.user!.id));
      project.units = project.units
        .map((u) => ({
          ...u,
          phases: u.phases
            .map((p) => ({ ...p, subPhases: p.subPhases.filter((sp) => subPhaseIds.has(sp.id)) }))
            .filter((p) => p.subPhases.length > 0),
        }))
        .filter((u) => u.phases.length > 0);
    }

    res.json(project);
  })
);

projectsRouter.post(
  "/",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { name, location, overallStatus, owners, totalBudget, currentStage, participants, entrepreneurId } =
      req.body as {
        name?: string;
        location?: string;
        overallStatus?: string;
        owners?: string;
        totalBudget?: number;
        currentStage?: string;
        participants?: { trade?: string; userId?: number }[];
        entrepreneurId?: number;
      };
    if (!name || !location) {
      res.status(400).json({ error: "name and location are required" });
      return;
    }
    if (currentStage && !validStages.includes(currentStage)) {
      res.status(400).json({ error: `currentStage must be one of ${validStages.join(", ")}` });
      return;
    }

    let resolvedEntrepreneurId: number;
    if (req.user!.role === Role.ENTREPRENEUR) {
      resolvedEntrepreneurId = req.user!.id;
      const count = await prisma.project.count({ where: { entrepreneurId: resolvedEntrepreneurId } });
      if (count >= 5) {
        res.status(403).json({ error: "הגעת למכסת הפרויקטים המקסימלית (5 פרויקטים)" });
        return;
      }
    } else {
      if (!entrepreneurId) {
        res.status(400).json({ error: "entrepreneurId is required" });
        return;
      }
      const entrepreneur = await prisma.user.findUnique({ where: { id: Number(entrepreneurId) } });
      if (!entrepreneur || entrepreneur.role !== Role.ENTREPRENEUR) {
        res.status(400).json({ error: "entrepreneurId must reference an existing ENTREPRENEUR user" });
        return;
      }
      resolvedEntrepreneurId = entrepreneur.id;
    }

    let participantsData: { trade: string; userId: number }[] = [];
    if (participants) {
      const result = await validateParticipants(participants, req.user!);
      if ("error" in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      participantsData = result.data;
    }

    const project = await prisma.project.create({
      data: {
        name,
        location,
        overallStatus: overallStatus ?? PhaseStatus.NOT_STARTED,
        owners: owners ?? null,
        totalBudget: totalBudget ?? null,
        currentStage: currentStage ?? null,
        entrepreneurId: resolvedEntrepreneurId,
        participants: { create: participantsData },
      },
      include: participantInclude,
    });
    res.status(201).json(project);
  })
);

projectsRouter.patch(
  "/:id",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const { name, location, overallStatus, owners, totalBudget, currentStage, participants } = req.body as {
      name?: string;
      location?: string;
      overallStatus?: string;
      owners?: string;
      totalBudget?: number;
      currentStage?: string;
      participants?: { trade?: string; userId?: number }[];
    };
    if (currentStage && !validStages.includes(currentStage)) {
      res.status(400).json({ error: `currentStage must be one of ${validStages.join(", ")}` });
      return;
    }

    let participantsData: { trade: string; userId: number }[] | undefined;
    if (participants !== undefined) {
      const result = await validateParticipants(participants, req.user!);
      if ("error" in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      participantsData = result.data;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (participantsData !== undefined) {
        await tx.projectParticipant.deleteMany({ where: { projectId: id } });
        if (participantsData.length > 0) {
          await tx.projectParticipant.createMany({
            data: participantsData.map((p) => ({ ...p, projectId: id })),
          });
        }
      }
      return tx.project.update({
        where: { id },
        data: { name, location, overallStatus, owners, totalBudget, currentStage },
        include: participantInclude,
      });
    });
    res.json(updated);
  })
);

projectsRouter.delete(
  "/:id",
  requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!assertProjectOwnership(project, req.user!)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  })
);
