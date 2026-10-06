import type { Context, Next } from "hono";
import { sign, verify } from "hono/jwt";
import { Role } from "../constants";
import type { AppEnv } from "../worker-env";

// Port of src/middleware/auth.ts. jsonwebtoken (Node's `crypto` module) has
// no supported build for the Workers runtime without the `nodejs_compat`
// flag; hono/jwt is a Web Crypto (SubtleCrypto) implementation that runs
// natively in Workers, so it replaces jsonwebtoken here rather than adding
// that flag. HS256 (hono/jwt's default) matches jsonwebtoken's default
// algorithm, and hono/jwt's `verify` checks `exp` itself, so an
// expired-vs-malformed token is indistinguishable here just like the
// original — both are caught generically and reported the same message.
const SESSION_EXPIRY_SECONDS = 12 * 60 * 60;

export function issueSessionToken(user: { id: number; role: string }, secret: string) {
  return sign(
    { id: user.id, role: user.role, kind: "session", exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS },
    secret
  );
}

function bearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = bearerToken(c);
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  let payload: { id: number; role: string; kind?: string };
  try {
    payload = (await verify(token, c.env.JWT_SECRET, "HS256")) as typeof payload;
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  if (payload.kind !== "session") {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  c.set("user", { id: payload.id, role: payload.role });
  c.header("X-Refreshed-Token", await issueSessionToken(payload, c.env.JWT_SECRET));
  await next();
}

export async function requirePendingAuth(c: Context<AppEnv>, next: Next) {
  const token = bearerToken(c);
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  let payload: { id: number; kind?: string };
  try {
    payload = (await verify(token, c.env.JWT_SECRET, "HS256")) as typeof payload;
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  if (payload.kind !== "totp_pending") {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  c.set("pendingUserId", payload.id);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (user?.role !== Role.SUPER_ADMIN) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}
