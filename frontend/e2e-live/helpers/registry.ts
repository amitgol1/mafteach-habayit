import fs from "node:fs";
import path from "node:path";

// Records every id this run creates so teardown can clean up even after a
// crash. Lives outside Playwright's outputDir (which is wiped on each run).
export const REGISTRY_DIR = path.resolve(process.cwd(), "test-results/live-registry");
const FILE = path.join(REGISTRY_DIR, "state.json");

export interface RegistryState {
  runId: string;
  projects: number[];
  users: number[];
}

export function readState(): RegistryState | null {
  if (!fs.existsSync(FILE)) return null;
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as RegistryState;
}

export function writeState(state: RegistryState): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function initState(runId: string): void {
  writeState({ runId, projects: [], users: [] });
}

function mustRead(): RegistryState {
  const s = readState();
  if (!s) throw new Error("live registry missing - globalSetup did not run");
  return s;
}

export function getRunId(): string {
  return mustRead().runId;
}

export function trackProject(id: number): void {
  const s = mustRead();
  if (!s.projects.includes(id)) s.projects.push(id);
  writeState(s);
}

export function trackUser(id: number): void {
  const s = mustRead();
  if (!s.users.includes(id)) s.users.push(id);
  writeState(s);
}

// Naming: every record starts with QA-<runId>; emails are qa-<runId>-*@test.local.
export function qaName(suffix: string): string {
  return `QA-${getRunId()}-${suffix}`;
}

export function qaEmail(suffix: string): string {
  return `qa-${getRunId()}-${suffix}@test.local`;
}

export const QA_PASSWORD = "QaPass-12345!";
