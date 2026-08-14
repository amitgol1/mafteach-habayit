import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";

export const unitsRouter = Router();

unitsRouter.use(requireAuth, requireAdmin);

unitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, identifier } = req.body as { projectId?: number; identifier?: string };
    if (!projectId || !identifier) {
      res.status(400).json({ error: "projectId and identifier are required" });
      return;
    }
    const unit = await prisma.unit.create({ data: { projectId, identifier } });
    res.status(201).json(unit);
  })
);

unitsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { identifier } = req.body as { identifier?: string };
    const unit = await prisma.unit.update({ where: { id }, data: { identifier } });
    res.json(unit);
  })
);

unitsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.unit.delete({ where: { id } });
    res.status(204).send();
  })
);
