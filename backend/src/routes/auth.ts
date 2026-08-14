import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../middleware/asyncHandler";
import { prisma } from "../prisma";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
      expiresIn: "12h",
    });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade },
    });
  })
);
