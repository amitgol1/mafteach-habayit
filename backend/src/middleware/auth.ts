import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../constants";

export interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

export interface PendingAuthedRequest extends Request {
  pendingUserId?: number;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; role: string; kind?: string };
    if (payload.kind !== "session") {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.user = { id: payload.id, role: payload.role };

    const refreshed = jwt.sign({ id: payload.id, role: payload.role, kind: "session" }, process.env.JWT_SECRET!, {
      expiresIn: "12h",
    });
    res.setHeader("X-Refreshed-Token", refreshed);

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requirePendingAuth(req: PendingAuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; kind?: string };
    if (payload.kind !== "totp_pending") {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.pendingUserId = payload.id;
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
