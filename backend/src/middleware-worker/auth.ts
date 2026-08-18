import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
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
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = (await verify(token, c.env.JWT_SECRET, "HS256")) as { id: number; role: string };
    c.set("user", { id: payload.id, role: payload.role });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (user?.role !== Role.SUPER_ADMIN) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}
