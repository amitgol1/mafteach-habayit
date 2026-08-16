import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../constants";

export interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; role: string };
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.SUPER_ADMIN) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
