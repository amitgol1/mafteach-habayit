import { NextFunction, Response, Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { mediaTypeFromMime, publicUploadPath, upload } from "../utils/upload";
import { isAssignedToSubPhase } from "../utils/subPhaseAccess";

export const updatesRouter = Router();

updatesRouter.use(requireAuth);

const updateAuthorSelect = { id: true, name: true, role: true, trade: true } as const;

function requireSubPhaseAccess() {
  return asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const subPhaseId = Number(req.params.subPhaseId);
    if (req.user!.role === "ADMIN") {
      next();
      return;
    }
    if (!(await isAssignedToSubPhase(req.user!.id, subPhaseId))) {
      res.status(403).json({ error: "Not assigned to this sub-phase" });
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
    const updates = await prisma.update.findMany({
      where: { subPhaseId },
      orderBy: { timestamp: "asc" },
      include: { user: { select: updateAuthorSelect } },
    });
    res.json(updates);
  })
);

updatesRouter.post(
  "/sub-phases/:subPhaseId/updates",
  requireSubPhaseAccess(),
  upload.single("media"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subPhaseId = Number(req.params.subPhaseId);
    const { messageText } = req.body as { messageText?: string };
    const file = req.file;
    if (!messageText && !file) {
      res.status(400).json({ error: "messageText or media file is required" });
      return;
    }

    const update = await prisma.update.create({
      data: {
        subPhaseId,
        userId: req.user!.id,
        messageText: messageText ?? null,
        mediaUrl: file ? publicUploadPath(file.filename) : null,
        mediaType: file ? mediaTypeFromMime(file.mimetype) : null,
      },
      include: { user: { select: updateAuthorSelect } },
    });
    res.status(201).json(update);
  })
);
