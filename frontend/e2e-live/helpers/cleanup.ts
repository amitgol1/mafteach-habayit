import { call, qaAdmin } from "./api";
import { loadLiveEnv } from "./env";
import { readState, trackProject, type RegistryState } from "./registry";

export interface CleanupReport {
  deletedProjects: number[];
  deletedUsers: number[];
  errors: string[];
  leftoverProjects: { id: number; name: string }[];
  leftoverUsers: { id: number; name: string; email: string }[];
}

// Deletes only records this suite created: either tracked in the registry or
// named QA-<runId>, and in both cases the name must start with "QA-". The QA
// admin itself and any non-QA record are never touched.
export async function cleanup(state: RegistryState): Promise<CleanupReport> {
  const env = loadLiveEnv();
  const admin = await qaAdmin();
  const report: CleanupReport = { deletedProjects: [], deletedUsers: [], errors: [], leftoverProjects: [], leftoverUsers: [] };
  const prefix = `QA-${state.runId}`;

  const isOurs = (name: string, id: number, tracked: number[]) =>
    name.startsWith("QA-") && (name.startsWith(prefix) || tracked.includes(id));

  // 1. projects (cascade units/phases/sub-phases/updates/payments)
  const projects = await call<{ id: number; name: string }[]>(admin.token, "GET", "/projects");
  for (const p of Array.isArray(projects.json) ? projects.json : []) {
    if (!isOurs(p.name, p.id, state.projects)) continue;
    const r = await call(admin.token, "DELETE", `/projects/${p.id}`);
    if (r.status === 204 || r.status === 404) report.deletedProjects.push(p.id);
    else report.errors.push(`delete project ${p.id}: ${r.status}`);
  }

  // 2. collaborators, then 3. entrepreneurs
  const usersRes = await call<{ id: number; name: string; email: string; role: string }[]>(admin.token, "GET", "/users");
  const users = (Array.isArray(usersRes.json) ? usersRes.json : []).filter(
    (u) => u.email !== env.LIVE_QA_ADMIN_EMAIL && u.id !== admin.user.id && isOurs(u.name, u.id, state.users)
  );
  for (const role of ["COLLABORATOR", "ENTREPRENEUR"]) {
    for (const u of users.filter((x) => x.role === role)) {
      const r = await call(admin.token, "DELETE", `/users/${u.id}`);
      if (r.status === 204 || r.status === 404) report.deletedUsers.push(u.id);
      else report.errors.push(`delete user ${u.id} (${role}): ${r.status} ${JSON.stringify(r.json)}`);
    }
  }

  // verification: any QA- project/user left (any run), excluding the QA admin
  const p2 = await call<{ id: number; name: string }[]>(admin.token, "GET", "/projects");
  report.leftoverProjects = (Array.isArray(p2.json) ? p2.json : [])
    .filter((p) => p.name.startsWith("QA-"))
    .map((p) => ({ id: p.id, name: p.name }));
  const u2 = await call<{ id: number; name: string; email: string }[]>(admin.token, "GET", "/users");
  report.leftoverUsers = (Array.isArray(u2.json) ? u2.json : [])
    .filter((u) => u.email !== env.LIVE_QA_ADMIN_EMAIL && (u.name.startsWith("QA-") || u.email.startsWith("qa-")))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));
  return report;
}

export { readState, trackProject };
