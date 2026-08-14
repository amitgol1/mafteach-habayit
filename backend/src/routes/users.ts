import bcrypt from "bcryptjs";
import { Router } from "express";
import { Role, Trade } from "../constants";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

const userSelect = { id: true, name: true, email: true, role: true, trade: true, createdAt: true } as const;

const validTrades = Object.values(Trade) as string[];

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
    res.json(users);
  })
);

usersRouter.get(
  "/by-trade",
  asyncHandler(async (req, res) => {
    const trade = req.query.trade as string | undefined;
    if (!trade) {
      res.status(400).json({ error: "trade query param is required" });
      return;
    }
    if (!validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }
    const users = await prisma.user.findMany({ where: { trade }, select: userSelect, orderBy: { name: "asc" } });
    res.json(users);
  })
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
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
    if (role !== Role.ADMIN && role !== Role.COLLABORATOR) {
      res.status(400).json({ error: `role must be one of ${Role.ADMIN}, ${Role.COLLABORATOR}` });
      return;
    }
    if (trade && !validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, trade: trade ?? null },
      select: userSelect,
    });
    res.status(201).json(user);
  })
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, role, trade } = req.body as { name?: string; role?: string; trade?: string };
    if (trade && !validTrades.includes(trade)) {
      res.status(400).json({ error: `trade must be one of ${validTrades.join(", ")}` });
      return;
    }
    const user = await prisma.user.update({ where: { id }, data: { name, role, trade }, select: userSelect });
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  })
);
