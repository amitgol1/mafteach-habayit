import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { and, asc, eq, sql } from "drizzle-orm";
import { Role, Trade } from "../constants";
import { requireAuth } from "../middleware-worker/auth";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { assertUserOwnership, requireRole, userTenantFilter } from "../utils-worker/tenantScope";
import type { AppEnv } from "../worker-env";

// Port of src/routes/users.ts.
export const usersRouter = new Hono<AppEnv>();

usersRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.ENTREPRENEUR));

const userSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  trade: users.trade,
  createdAt: users.createdAt,
} as const;

const validTrades = Object.values(Trade) as string[];

usersRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const where = userTenantFilter(c.get("user"));
  const rows = await db.select(userSelect).from(users).where(where).orderBy(asc(users.name));
  return c.json(rows);
});

usersRouter.get("/by-trade", async (c) => {
  const trade = c.req.query("trade");
  if (!trade) {
    return c.json({ error: "trade query param is required" }, 400);
  }
  if (!validTrades.includes(trade)) {
    return c.json({ error: `trade must be one of ${validTrades.join(", ")}` }, 400);
  }
  const db = createDb(c.env.DB);
  const tenantWhere = userTenantFilter(c.get("user"));
  const tradeCondition = eq(users.trade, trade as Trade);
  const where = tenantWhere ? and(tradeCondition, tenantWhere) : tradeCondition;
  const rows = await db.select(userSelect).from(users).where(where).orderBy(asc(users.name));
  return c.json(rows);
});

usersRouter.post("/", async (c) => {
  const actor = c.get("user");
  const { name, email, password, role, trade } = await c.req.json<{
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    trade?: string;
  }>();
  if (!name || !email || !password || !role) {
    return c.json({ error: "name, email, password, role are required" }, 400);
  }

  const allowedRole = actor.role === Role.SUPER_ADMIN ? Role.ENTREPRENEUR : Role.COLLABORATOR;
  if (role !== allowedRole) {
    return c.json({ error: `role must be ${allowedRole}` }, 400);
  }
  if (trade && !validTrades.includes(trade)) {
    return c.json({ error: `trade must be one of ${validTrades.join(", ")}` }, 400);
  }

  const db = createDb(c.env.DB);

  if (actor.role === Role.ENTREPRENEUR) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.createdById, actor.id));
    if (existing.length >= 20) {
      return c.json({ error: "הגעת למכסת המשתמשים המקסימלית (20 משתמשים)" }, 403);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role: role as Role,
      trade: (trade ?? null) as Trade | null,
      createdById: actor.id,
    })
    .returning(userSelect);
  return c.json(user, 201);
});

usersRouter.patch("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }
  if (!assertUserOwnership(target, actor)) {
    return c.json({ error: "Not authorized for this user" }, 403);
  }

  const { name, role, trade } = await c.req.json<{ name?: string; role?: string; trade?: string }>();
  if (trade && !validTrades.includes(trade)) {
    return c.json({ error: `trade must be one of ${validTrades.join(", ")}` }, 400);
  }
  if (role !== undefined) {
    const allowedRole = actor.role === Role.SUPER_ADMIN ? Role.ENTREPRENEUR : Role.COLLABORATOR;
    if (role !== allowedRole) {
      return c.json({ error: `role must be ${allowedRole}` }, 400);
    }
  }
  const [user] = await db
    .update(users)
    // `id` is a self-referential no-op column so the SET clause is never
    // empty when name/role/trade are all omitted — see the comment on the
    // equivalent guard in routes-worker/projects.ts for why D1 needs this.
    .set({ id: sql`${users.id}`, name, role: role as Role | undefined, trade: trade as Trade | undefined })
    .where(eq(users.id, id))
    .returning(userSelect);
  return c.json(user);
});

usersRouter.delete("/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const db = createDb(c.env.DB);
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }
  if (!assertUserOwnership(target, actor)) {
    return c.json({ error: "Not authorized for this user" }, 403);
  }
  await db.delete(users).where(eq(users.id, id));
  return c.body(null, 204);
});
