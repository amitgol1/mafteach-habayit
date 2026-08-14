import { Router } from "express";
import { PhaseStatus, ProjectStage, Trade } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { getAssignedSubPhaseIds } from "../utils/subPhaseAccess";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

const validTrades = Object.values(Trade) as string[];
const validStages = Object.values(ProjectStage) as string[];

const participantInclude = {
  participants: { include: { user: { select: { id: true, name: true, trade: true } } } },
} as const;

projectsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.user!.role === "ADMIN") {
      const projects = await prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        include: { units: { include: { phases: { orderBy: { order: "asc" } } } } },
      });
      res.json(projects);
      return;
    }

    const subPhaseIds = await getAssignedSubPhaseIds(req.user!.id);
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { units: { some: { phases: { some: { subPhases: { some: { id: { in: subPhaseIds } } } } } } } },
          { participants: { some: { userId: req.user!.id } } },
        ],
      },
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
      },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (req.user!.role !== "ADMIN") {
      const subPhaseIds = new Set(await getAssignedSubPhaseIds(req.user!.id));
      const hasSubPhaseAccess = project.units.some((u) => u.phases.some((p) => p.subPhases.some((sp) => subPhaseIds.has(sp.id))));
      const isParticipant =
        (await prisma.projectParticipant.findFirst({ where: { projectId: id, userId: req.user!.id } })) !== null;
      const hasAccess = hasSubPhaseAccess || isParticipant;
      if (!hasAccess) {
        res.status(403).json({ error: "Not assigned to this project" });
        return;
      }
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
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, location, overallStatus, owners, totalBudget, currentStage, participants } = req.body as {
      name?: string;
      location?: string;
      overallStatus?: string;
      owners?: string;
      totalBudget?: number;
      currentStage?: string;
      participants?: { trade?: string; userId?: number }[];
    };
    if (!name || !location) {
      res.status(400).json({ error: "name and location are required" });
      return;
    }
    if (currentStage && !validStages.includes(currentStage)) {
      res.status(400).json({ error: `currentStage must be one of ${validStages.join(", ")}` });
      return;
    }

    let participantsData: { trade: string; userId: number }[] = [];
    if (participants) {
      if (!Array.isArray(participants) || participants.length > 7) {
        res.status(400).json({ error: "participants must be an array of at most 7 entries" });
        return;
      }
      for (const p of participants) {
        if (!p.trade || !validTrades.includes(p.trade)) {
          res.status(400).json({ error: `participants[].trade must be one of ${validTrades.join(", ")}` });
          return;
        }
        if (!p.userId) {
          res.status(400).json({ error: "participants[].userId is required" });
          return;
        }
      }
      const trades = participants.map((p) => p.trade);
      if (new Set(trades).size !== trades.length) {
        res.status(400).json({ error: "participants must not contain duplicate trades" });
        return;
      }
      const userIds = participants.map((p) => p.userId!);
      const existingUsers = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
      const existingIds = new Set(existingUsers.map((u) => u.id));
      const missing = userIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        res.status(400).json({ error: `userId(s) not found: ${missing.join(", ")}` });
        return;
      }
      participantsData = participants.map((p) => ({ trade: p.trade!, userId: p.userId! }));
    }

    const project = await prisma.project.create({
      data: {
        name,
        location,
        overallStatus: overallStatus ?? PhaseStatus.NOT_STARTED,
        owners: owners ?? null,
        totalBudget: totalBudget ?? null,
        currentStage: currentStage ?? null,
        participants: { create: participantsData },
      },
      include: participantInclude,
    });
    res.status(201).json(project);
  })
);

projectsRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, location, overallStatus } = req.body as {
      name?: string;
      location?: string;
      overallStatus?: string;
    };
    const project = await prisma.project.update({ where: { id }, data: { name, location, overallStatus } });
    res.json(project);
  })
);

projectsRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  })
);
