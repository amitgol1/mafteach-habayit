import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import type { AppEnv } from "../worker-env";

// Port of src/routes/auth.ts.
export const authRouter = new Hono<AppEnv>();

const JWT_EXPIRY_SECONDS = 12 * 60 * 60;

authRouter.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await sign(
    { id: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS },
    c.env.JWT_SECRET
  );
  return c.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, trade: user.trade },
  });
});
