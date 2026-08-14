import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

export default async function globalSetup() {
  const backendRoot = path.resolve(import.meta.dirname, "..");
  config({ path: path.join(backendRoot, ".env.test"), override: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.includes("test.db")) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL does not look like the test database (got: ${dbUrl}). ` +
        "This guard exists to prevent tests from ever touching prisma/dev.db."
    );
  }

  const dbFile = path.join(backendRoot, "prisma", dbUrl.replace("file:./", ""));
  for (const f of [dbFile, `${dbFile}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }

  execSync("npx prisma migrate deploy", {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
  });
}
