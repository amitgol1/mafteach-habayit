// Safety net: every test worker re-checks that it is pointed at the test
// database before any test can import prisma/app and touch data. If this
// throws, real data (prisma/dev.db) is never at risk.
if (!process.env.DATABASE_URL?.includes("test.db")) {
  throw new Error(
    `Test DATABASE_URL safety check failed (got: ${process.env.DATABASE_URL}). Refusing to run.`
  );
}
