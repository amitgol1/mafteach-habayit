import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import * as qrcode from "qrcode";
import { asyncHandler } from "../middleware/asyncHandler";
import { PendingAuthedRequest, requirePendingAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { decryptSecret, encryptSecret } from "../utils/totpCrypto";

// otplib defaults to window: 0 — zero clock-drift tolerance, meaning a code
// is only accepted within the exact 30s step it was generated in. Any
// network/processing delay that crosses a step boundary between a user
// reading a code off their authenticator app and the request reaching this
// server would reject a genuinely correct code. window: 1 accepts the
// adjacent step on either side (±30s), the standard tolerance recommended
// for TOTP (RFC 6238) and used by most real-world implementations.
authenticator.options = { window: 1 };

export const authRouter = Router();

function issueSessionToken(user: { id: number; role: string }) {
  return jwt.sign({ id: user.id, role: user.role, kind: "session" }, process.env.JWT_SECRET!, {
    expiresIn: "12h",
  });
}

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

    const pendingToken = jwt.sign({ id: user.id, kind: "totp_pending" }, process.env.JWT_SECRET!, {
      expiresIn: "10m",
    });
    const userPayload = { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade };

    if (!user.totpConfirmedAt) {
      res.json({ status: "totp_setup_required", pendingToken, user: userPayload });
      return;
    }

    res.json({ status: "totp_required", pendingToken, user: userPayload });
  })
);

authRouter.post(
  "/totp/setup",
  requirePendingAuth,
  asyncHandler(async (req: PendingAuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.pendingUserId! } });
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (user.totpConfirmedAt) {
      res.status(409).json({ error: "TOTP already configured" });
      return;
    }

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret) } });

    const otpauthUrl = authenticator.keyuri(user.email, "mafteach-habayit", secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  })
);

authRouter.post(
  "/totp/confirm",
  requirePendingAuth,
  asyncHandler(async (req: PendingAuthedRequest, res) => {
    const { code } = req.body as { code?: string };
    const user = await prisma.user.findUnique({ where: { id: req.pendingUserId! } });
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (user.totpConfirmedAt) {
      res.status(409).json({ error: "TOTP already configured" });
      return;
    }
    if (!user.totpSecret) {
      res.status(400).json({ error: "Call /auth/totp/setup first" });
      return;
    }
    if (!code || !authenticator.verify({ token: code, secret: decryptSecret(user.totpSecret) })) {
      res.status(401).json({ error: "Invalid code" });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { totpConfirmedAt: new Date() } });

    const token = issueSessionToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade },
    });
  })
);

authRouter.post(
  "/totp/verify",
  requirePendingAuth,
  asyncHandler(async (req: PendingAuthedRequest, res) => {
    const { code } = req.body as { code?: string };
    const user = await prisma.user.findUnique({ where: { id: req.pendingUserId! } });
    if (!user || !user.totpSecret) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (!code || !authenticator.verify({ token: code, secret: decryptSecret(user.totpSecret) })) {
      res.status(401).json({ error: "Invalid code" });
      return;
    }

    const token = issueSessionToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade },
    });
  })
);
