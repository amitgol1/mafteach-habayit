import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { Role } from "../src/constants";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@mafteach-habayit.local";
  const password = "admin123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name: "אדמין", email, passwordHash, role: Role.ADMIN },
  });

  console.log("Seeded admin user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Change this password after first login.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
