import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Sequential: all tests share one SQLite file (test.db). Parallel workers
    // would race on file locks and on shared rows. Fine at this suite size.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
