import bcrypt from "bcryptjs";
import { Router } from "express";
import { Role, Trade } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { assertUserOwnership, requireRole, userTenantFilter } from "../utils/tenantScope";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

const userSelect = { id: true, name: true, email: true, role: true, trade: true, createdAt: true } as const;

const validTrades = Object.values(Trade) as string[];

usersRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const where = userTenantFilter(req.user!);
    const users = await prisma.user.findMany({ where, select: userSelect, orderBy: { name: "asc" } });
    res.json(users);
  })
);

usersRouter.get(
  "/by-trade",
  asyncHandler(async (req: AuthedRequest, res) => {
    const trade = req.query.trade as string | undefined;
    if (!trade) {
      res.status(400).json({ error: "trade query param is required" });
      return;
    }
    if (!validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }
    const tenantWhere = userTenantFilter(req.user!);
    const users = await prisma.user.findMany({
      where: { AND: [{ trade }, tenantWhere] },
      select: userSelect,
      orderBy: { name: "asc" },
    });
    res.json(users);
  })
);

usersRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { name, email, password, role, trade } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      trade?: string;
    };
    if (!name || !email || !password || !role) {
      res.status(400).json({ error: "name, email, password, role are required" });
      return;
    }

    const allowedRole = req.user!.role === Role.SUPER_ADMIN ? Role.ENTREPRENEUR : Role.COLLABORATOR;
    if (role !== allowedRole) {
      res.status(400).json({ error: `role must be ${allowedRole}` });
      return;
    }
    if (trade && !validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }

    if (req.user!.role === Role.ENTREPRENEUR) {
      const count = await prisma.user.count({ where: { createdById: req.user!.id } });
      if (count >= 20) {
        res.status(403).json({ error: "הגעת למכסת המשתמשים המקסימלית (20 משתמשים)" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, trade: trade ?? null, createdById: req.user!.id },
      select: userSelect,
    });
    res.status(201).json(user);
  })
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!assertUserOwnership(target, req.user!)) {
      res.status(403).json({ error: "Not authorized for this user" });
      return;
    }

    const { name, role, trade } = req.body as { name?: string; role?: string; trade?: string };
    if (trade && !validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }
    if (role !== undefined) {
      const allowedRole = req.user!.role === Role.SUPER_ADMIN ? Role.ENTREPRENEUR : Role.COLLABORATOR;
      if (role !== allowedRole) {
        res.status(400).json({ error: `role must be ${allowedRole}` });
        return;
      }
    }
    const user = await prisma.user.update({ where: { id }, data: { name, role, trade }, select: userSelect });
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!assertUserOwnership(target, req.user!)) {
      res.status(403).json({ error: "Not authorized for this user" });
      return;
    }
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  })
);
