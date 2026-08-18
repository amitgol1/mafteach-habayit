import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { Role } from "../constants";
import { users } from "./schema";

// D1/Drizzle port of prisma/seed.ts, for the Cloudflare POC. There is no
// `tsx prisma/seed.ts`-equivalent for D1: a Worker can't run a standalone
// Node script against its own binding, and D1 has no importable client
// library outside the Workers runtime. `getPlatformProxy` (from the
// `wrangler` package) is Cloudflare's documented mechanism for exactly this
// gap — it reads wrangler.jsonc, spins up the same local D1 emulation
// `wrangler dev` uses, and hands back a `env.DB` binding usable from a plain
// Node/tsx process, so this script runs the same way the old Prisma seed did
// (`npm run seed:worker`) while still using real Drizzle + D1.
//
// Scope decision vs. the original seed: the original also backfilled
// `createdById` on pre-existing COLLABORATOR users once the tenancy model
// was introduced — a one-time fixup for the live dev.db's history. D1 here
// is a brand-new database with no pre-existing rows, so there is nothing to
// backfill; that step is intentionally not ported. Only the two base users
// (SUPER_ADMIN, ENTREPRENEUR "יעקב") are seeded.

async function seedSuperAdmin(db: ReturnType<typeof drizzle>) {
  const email = "admin@mafteach-habayit.local";
  const password = "admin123";

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`Super admin user already exists: ${email}`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [admin] = await db
    .insert(users)
    .values({ name: "אדמין", email, passwordHash, role: Role.SUPER_ADMIN })
    .returning();

  console.log("Seeded super admin user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Change this password after first login.");
  return admin;
}

async function seedYakov(db: ReturnType<typeof drizzle>, adminId: number) {
  const email = "yakov@y.com";
  const password = "Yakov123!";

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`Entrepreneur user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    name: "יעקב",
    email,
    passwordHash,
    role: Role.ENTREPRENEUR,
    createdById: adminId,
  });

  console.log("Seeded entrepreneur user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

async function main() {
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB);

  try {
    const admin = await seedSuperAdmin(db);
    await seedYakov(db, admin.id);
  } finally {
    await dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
