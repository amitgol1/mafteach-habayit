import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { Role } from "../src/constants";
import { encryptSecret } from "../src/utils/totpCrypto";

const prisma = new PrismaClient();

// Only for the isolated e2e database — mirrors the DATABASE_URL safety check
// in backend/tests/setup.ts. Never runs against dev.db: `npm run seed`
// (local dev, docs/RUNNING.md) uses DATABASE_URL="file:./dev.db", which does
// not match "e2e.db", so real accounts always fall through to the normal
// null/null "needs setup" state.
const E2E_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // committed, well-known — e2e-only, see docs/specs/totp-2fa.md

async function preConfirmTotpForE2e() {
  if (!process.env.DATABASE_URL?.includes("e2e.db")) return;

  await prisma.user.update({
    where: { email: "admin@mafteach-habayit.local" },
    data: { totpSecret: encryptSecret(E2E_TOTP_SECRET), totpConfirmedAt: new Date() },
  });
  await prisma.user.update({
    where: { email: "yakov@y.com" },
    data: { totpSecret: encryptSecret(E2E_TOTP_SECRET), totpConfirmedAt: new Date() },
  });
}

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
  await preConfirmTotpForE2e();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
