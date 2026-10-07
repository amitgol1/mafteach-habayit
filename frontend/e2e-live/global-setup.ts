import fs from "node:fs";
import path from "node:path";
import { qaAdmin } from "./helpers/api";
import { cleanup } from "./helpers/cleanup";
import { REGISTRY_DIR, initState, readState } from "./helpers/registry";

export default async function globalSetup() {
  // A registry left behind by a crashed run: clean its (QA- named) records first.
  const stale = readState();
  if (stale && (stale.projects.length > 0 || stale.users.length > 0)) {
    const report = await cleanup(stale);
    console.log(
      `[live-qa] cleaned stale registry of run ${stale.runId}: ${report.deletedProjects.length} projects, ${report.deletedUsers.length} users, ${report.errors.length} errors`
    );
  }
  await qaAdmin(); // fail fast if credentials/TOTP do not work
  const runId = String(Date.now());
  fs.rmSync(path.join(REGISTRY_DIR, "transient-errors.log"), { force: true });
  initState(runId);
  console.log(`[live-qa] run id ${runId}`);
}
