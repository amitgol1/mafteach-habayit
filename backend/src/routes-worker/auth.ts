import { Hono } from "hono";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import * as qrcode from "qrcode";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { issueSessionToken, requirePendingAuth } from "../middleware-worker/auth";
import { hashPassword, needsRehash, verifyPassword } from "../utils/password";
import { decryptSecret, encryptSecret } from "../utils-worker/totpCrypto";
import type { AppEnv } from "../worker-env";

// Port of src/routes/auth.ts. window: 1 — see the comment there.
authenticator.options = { window: 1 };

export const authRouter = new Hono<AppEnv>();

const PENDING_EXPIRY_SECONDS = 10 * 60;

function userPayload(user: typeof users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade };
}

authRouter.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  if (needsRehash(user.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  }

  const pendingToken = await sign(
    { id: user.id, kind: "totp_pending", exp: Math.floor(Date.now() / 1000) + PENDING_EXPIRY_SECONDS },
    c.env.JWT_SECRET
  );

  if (!user.totpConfirmedAt) {
    return c.json({ status: "totp_setup_required", pendingToken, user: userPayload(user) });
  }
  return c.json({ status: "totp_required", pendingToken, user: userPayload(user) });
});

authRouter.post("/totp/setup", requirePendingAuth, async (c) => {
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, c.get("pendingUserId"))).limit(1);
  if (!user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  if (user.totpConfirmedAt) {
    return c.json({ error: "TOTP already configured" }, 409);
  }

  const secret = authenticator.generateSecret();
  await db
    .update(users)
    .set({ totpSecret: encryptSecret(secret, c.env.TOTP_ENCRYPTION_KEY) })
    .where(eq(users.id, user.id));

  const otpauthUrl = authenticator.keyuri(user.email, "mafteach-habayit", secret);
  // SVG instead of qrcode.toDataURL's PNG: the PNG path needs <canvas> in the
  // browser build that wrangler bundles. An SVG data URL renders the same in <img>.
  const svg = await qrcode.toString(otpauthUrl, { type: "svg" });
  const qrCodeDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return c.json({ secret, otpauthUrl, qrCodeDataUrl });
});

authRouter.post("/totp/confirm", requirePendingAuth, async (c) => {
  const { code } = await c.req.json<{ code?: string }>();
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, c.get("pendingUserId"))).limit(1);
  if (!user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  if (user.totpConfirmedAt) {
    return c.json({ error: "TOTP already configured" }, 409);
  }
  if (!user.totpSecret) {
    return c.json({ error: "Call /auth/totp/setup first" }, 400);
  }
  if (!code || !authenticator.verify({ token: code, secret: decryptSecret(user.totpSecret, c.env.TOTP_ENCRYPTION_KEY) })) {
    return c.json({ error: "Invalid code" }, 401);
  }

  await db.update(users).set({ totpConfirmedAt: new Date() }).where(eq(users.id, user.id));

  const token = await issueSessionToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: userPayload(user) });
});

authRouter.post("/totp/verify", requirePendingAuth, async (c) => {
  const { code } = await c.req.json<{ code?: string }>();
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, c.get("pendingUserId"))).limit(1);
  if (!user || !user.totpSecret) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  if (!code || !authenticator.verify({ token: code, secret: decryptSecret(user.totpSecret, c.env.TOTP_ENCRYPTION_KEY) })) {
    return c.json({ error: "Invalid code" }, 401);
  }

  const token = await issueSessionToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: userPayload(user) });
});
