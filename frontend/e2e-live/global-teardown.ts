import fs from "node:fs";
import path from "node:path";
import { cleanup } from "./helpers/cleanup";
import { REGISTRY_DIR, readState } from "./helpers/registry";

export default async function globalTeardown() {
  const state = readState();
  if (!state) return;
  const report = await cleanup(state);
  console.log(
    `[live-qa] teardown run ${state.runId}: deleted projects=${JSON.stringify(report.deletedProjects)} users=${JSON.stringify(report.deletedUsers)}`
  );
  if (report.errors.length > 0) console.log(`[live-qa] teardown errors: ${report.errors.join(" | ")}`);
  console.log(
    `[live-qa] leftovers on live: projects=${JSON.stringify(report.leftoverProjects)} users=${JSON.stringify(report.leftoverUsers)}`
  );
  const log = path.join(REGISTRY_DIR, "transient-errors.log");
  if (fs.existsSync(log)) console.log(`[live-qa] edge/5xx errors seen by API helper:\n${fs.readFileSync(log, "utf8")}`);
  if (report.errors.length > 0 || report.leftoverProjects.length > 0 || report.leftoverUsers.length > 0) {
    throw new Error("live QA cleanup left QA- data behind (see log above)");
  }
}
