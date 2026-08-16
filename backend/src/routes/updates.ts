import { NextFunction, Response, Router } from "express";
import { Role } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { mediaTypeFromMime, publicUploadPath, uploadUpdateMedia } from "../utils/upload";
import { isAssignedToSubPhase } from "../utils/subPhaseAccess";
import { assertProjectOwnership, canAccessProject, getProjectForSubPhase } from "../utils/tenantScope";

export const updatesRouter = Router();

updatesRouter.use(requireAuth);

const updateAuthorSelect = { id: true, name: true, role: true, trade: true } as const;

const DEFAULT_PAGE_LIMIT = 10;
const MIN_PAGE_LIMIT = 1;
const MAX_PAGE_LIMIT = 50;

function parsePageLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(MIN_PAGE_LIMIT, Math.trunc(parsed)));
}

function parseBeforeCursor(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && !Number.isNaN(parsed) ? Math.trunc(parsed) : undefined;
}

async function fetchUpdatesPage(where: Record<string, unknown>, before: unknown, limitRaw: unknown) {
  const limit = parsePageLimit(limitRaw);
  const beforeId = parseBeforeCursor(before);
  const rows = await prisma.update.findMany({
    where: beforeId !== undefined ? { ...where, id: { lt: beforeId } } : where,
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { user: { select: updateAuthorSelect } },
  });
  const hasMore = rows.length > limit;
  const updates = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? updates[updates.length - 1].id : null;
  return { updates, nextCursor, hasMore };
}

function requireSubPhaseAccess() {
  return asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const subPhaseId = Number(req.params.subPhaseId);
    if (req.user!.role === Role.SUPER_ADMIN) {
      next();
      return;
    }
    if (req.user!.role === Role.ENTREPRENEUR) {
      const project = await getProjectForSubPhase(subPhaseId);
      if (assertProjectOwnership(project, req.user!)) {
        next();
        return;
      }
      res.status(403).json({ error: "Not assigned to this sub-phase" });
      return;
    }
    if (!(await isAssignedToSubPhase(req.user!.id, subPhaseId))) {
      res.status(403).json({ error: "Not assigned to this sub-phase" });
      return;
    }
    next();
  });
}

function requireProjectAccess() {
  return asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, entrepreneurId: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(project, req.user!))) {
      res.status(403).json({ error: "Not assigned to this project" });
      return;
    }
    next();
  });
}

updatesRouter.get(
  "/sub-phases/:subPhaseId/updates",
  requireSubPhaseAccess(),
  asyncHandler(async (req, res) => {
    const subPhaseId = Number(req.params.subPhaseId);
    const { before, limit } = req.query;
    const page = await fetchUpdatesPage({ subPhaseId }, before, limit);
    res.json(page);
  })
);

updatesRouter.post(
  "/sub-phases/:subPhaseId/updates",
  requireSubPhaseAccess(),
  uploadUpdateMedia.single("media"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subPhaseId = Number(req.params.subPhaseId);
    const { subject, description } = req.body as { subject?: string; description?: string };
    const file = req.file;
    if (!subject?.trim() && !description?.trim() && !file) {
      res.status(400).json({ error: "subject, description or media file is required" });
      return;
    }

    const update = await prisma.update.create({
      data: {
        subPhaseId,
        userId: req.user!.id,
        subject: subject ?? null,
        description: description ?? null,
        mediaUrl: file ? publicUploadPath(file.filename) : null,
        mediaType: file ? mediaTypeFromMime(file.mimetype) : null,
      },
      include: { user: { select: updateAuthorSelect } },
    });
    res.status(201).json(update);
  })
);

updatesRouter.get(
  "/projects/:projectId/updates",
  requireProjectAccess(),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
    const { before, limit } = req.query;
    const page = await fetchUpdatesPage({ projectId }, before, limit);
    res.json(page);
  })
);

updatesRouter.post(
  "/projects/:projectId/updates",
  requireProjectAccess(),
  uploadUpdateMedia.single("media"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const projectId = Number(req.params.projectId);
    const { subject, description } = req.body as { subject?: string; description?: string };
    const file = req.file;
    if (!subject?.trim() && !description?.trim() && !file) {
      res.status(400).json({ error: "subject, description or media file is required" });
      return;
    }

    const update = await prisma.update.create({
      data: {
        projectId,
        userId: req.user!.id,
        subject: subject ?? null,
        description: description ?? null,
        mediaUrl: file ? publicUploadPath(file.filename) : null,
        mediaType: file ? mediaTypeFromMime(file.mimetype) : null,
      },
      include: { user: { select: updateAuthorSelect } },
    });
    res.status(201).json(update);
  })
);
