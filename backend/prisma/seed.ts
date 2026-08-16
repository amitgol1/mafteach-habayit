import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { Role } from "../src/constants";

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  const email = "admin@mafteach-habayit.local";
  const password = "admin123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin user already exists: ${email}`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: { name: "אדמין", email, passwordHash, role: Role.SUPER_ADMIN },
  });

  console.log("Seeded super admin user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Change this password after first login.");
  return admin;
}

// One-time seed (not wired into server boot): creates the first ENTREPRENEUR
// user and backfills existing pre-tenancy data (the one project and all
// existing COLLABORATOR users) to belong to them. Idempotent — skips if
// Yakov already exists, matching the super-admin seed pattern above.
async function seedYakovAndBackfillTenancy(adminId: number) {
  const email = "yakov@y.com";
  const password = "Yakov123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Entrepreneur user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const yakov = await prisma.user.create({
    data: { name: "יעקב", email, passwordHash, role: Role.ENTREPRENEUR, createdById: adminId },
  });

  // Project.entrepreneurId has been NOT NULL since the make_entrepreneur_id_required
  // migration (which itself fails if any NULL rows exist), so by the time this
  // script runs there is never a Project left to backfill here — a
  // `where: { entrepreneurId: null }` filter is invalid against the current
  // (required-Int) schema and throws PrismaClientValidationError. Only
  // User.createdById (nullable) still needs backfilling.
  const collaboratorsUpdated = await prisma.user.updateMany({
    where: { role: Role.COLLABORATOR, createdById: null },
    data: { createdById: yakov.id },
  });

  console.log("Seeded entrepreneur user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  backfilled ${collaboratorsUpdated.count} collaborator(s) to createdById=${yakov.id}`);
}

async function main() {
  const admin = await seedSuperAdmin();
  await seedYakovAndBackfillTenancy(admin.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
