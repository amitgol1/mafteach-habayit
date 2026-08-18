import type { Context, Next } from "hono";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { Role } from "../constants";
import type { AppEnv, AuthedUser } from "../worker-env";
import type { Db } from "../db/client";
import { phases, projectParticipants, projects, subPhases, units, users } from "../db/schema";
import { getAssignedSubPhaseIds } from "./subPhaseAccess";

// Port of src/utils/tenantScope.ts. Prisma's relational `where` filters
// (`units: { some: { phases: { some: { subPhases: { some: {...} } } } } }`)
// have no direct Drizzle equivalent against D1/SQLite, so the two
// list-scoping filters (projectTenantFilter, canAccessProject's sub-phase
// branch) are rebuilt as an explicit join → collect matching project ids →
// `inArray(projects.id, ids)`. This resolves to the same project set Prisma's
// relational filter would, just via an extra query instead of one nested SQL
// statement.

type ProjectOwnerFields = { entrepreneurId: number };
type ProjectRef = { id: number } & ProjectOwnerFields;

export function requireRole(...roles: Role[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role as Role)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    await next();
  };
}

// List-scoping filter for GET /api/projects. Mirrors the access rules used
// for a single project (see canAccessProject) but shaped as a Drizzle
// `where` condition. Returns `undefined` for SUPER_ADMIN (no filter).
export async function projectTenantFilter(db: Db, user: AuthedUser): Promise<SQL | undefined> {
  if (user.role === Role.SUPER_ADMIN) return undefined;
  if (user.role === Role.ENTREPRENEUR) return eq(projects.entrepreneurId, user.id);

  const subPhaseIds = await getAssignedSubPhaseIds(db, user.id);
  const viaSubPhases =
    subPhaseIds.length > 0
      ? await db
          .select({ projectId: units.projectId })
          .from(subPhases)
          .innerJoin(phases, eq(subPhases.phaseId, phases.id))
          .innerJoin(units, eq(phases.unitId, units.id))
          .where(inArray(subPhases.id, subPhaseIds))
      : [];
  const viaParticipant = await db
    .select({ projectId: projectParticipants.projectId })
    .from(projectParticipants)
    .where(eq(projectParticipants.userId, user.id));

  const projectIds = [...new Set([...viaSubPhases.map((r) => r.projectId), ...viaParticipant.map((r) => r.projectId)])];
  return inArray(projects.id, projectIds);
}

// Ownership check for project mutations (and for Unit/Phase/SubPhase
// mutations once resolved up to their owning project). Does not admit
// COLLABORATORs — they never own/mutate a project directly.
export function assertProjectOwnership(project: ProjectOwnerFields | null, user: AuthedUser): boolean {
  if (!project) return false;
  if (user.role === Role.SUPER_ADMIN) return true;
  if (user.role === Role.ENTREPRENEUR) return project.entrepreneurId === user.id;
  return false;
}

// Read-access check for a single project: same rule as GET /api/projects/:id
// — SUPER_ADMIN unrestricted, ENTREPRENEUR-owner, or a COLLABORATOR assigned
// to a sub-phase within the project or added as a ProjectParticipant.
export async function canAccessProject(db: Db, project: ProjectRef, user: AuthedUser): Promise<boolean> {
  if (assertProjectOwnership(project, user)) return true;
  if (user.role !== Role.COLLABORATOR) return false;

  const subPhaseIds = await getAssignedSubPhaseIds(db, user.id);
  if (subPhaseIds.length > 0) {
    const [match] = await db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(units, eq(units.projectId, projects.id))
      .innerJoin(phases, eq(phases.unitId, units.id))
      .innerJoin(subPhases, eq(subPhases.phaseId, phases.id))
      .where(and(eq(projects.id, project.id), inArray(subPhases.id, subPhaseIds)))
      .limit(1);
    if (match) return true;
  }

  const [isParticipant] = await db
    .select()
    .from(projectParticipants)
    .where(and(eq(projectParticipants.projectId, project.id), eq(projectParticipants.userId, user.id)))
    .limit(1);
  return isParticipant !== undefined;
}

export function assertUserOwnership(
  targetUser: { createdById: number | null },
  actor: AuthedUser
): boolean {
  if (actor.role === Role.SUPER_ADMIN) return true;
  if (actor.role === Role.ENTREPRENEUR) return targetUser.createdById === actor.id;
  return false;
}

export function userTenantFilter(actor: AuthedUser): SQL | undefined {
  if (actor.role === Role.SUPER_ADMIN) return undefined;
  return or(eq(users.id, actor.id), eq(users.createdById, actor.id));
}

// Resolve the owning project for Unit/Phase/SubPhase mutations, so callers
// can run assertProjectOwnership()/canAccessProject() against one shape.
export async function getProjectForUnit(db: Db, unitId: number): Promise<ProjectRef | null> {
  const [row] = await db
    .select({ id: projects.id, entrepreneurId: projects.entrepreneurId })
    .from(units)
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(units.id, unitId))
    .limit(1);
  return row ?? null;
}

export async function getProjectForPhase(db: Db, phaseId: number): Promise<ProjectRef | null> {
  const [row] = await db
    .select({ id: projects.id, entrepreneurId: projects.entrepreneurId })
    .from(phases)
    .innerJoin(units, eq(phases.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(phases.id, phaseId))
    .limit(1);
  return row ?? null;
}

export async function getProjectForSubPhase(db: Db, subPhaseId: number): Promise<ProjectRef | null> {
  const [row] = await db
    .select({ id: projects.id, entrepreneurId: projects.entrepreneurId })
    .from(subPhases)
    .innerJoin(phases, eq(subPhases.phaseId, phases.id))
    .innerJoin(units, eq(phases.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(subPhases.id, subPhaseId))
    .limit(1);
  return row ?? null;
}
