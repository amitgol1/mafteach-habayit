import { NextFunction, Response } from "express";
import { Prisma } from "@prisma/client";
import { Role } from "../constants";
import { AuthedRequest } from "../middleware/auth";
import { prisma } from "../prisma";
import { getAssignedSubPhaseIds } from "./subPhaseAccess";

type ProjectOwnerFields = { entrepreneurId: number };
type ProjectRef = { id: number } & ProjectOwnerFields;

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

// List-scoping filter for GET /api/projects. Mirrors the access rules used
// for a single project (see canAccessProject) but shaped as a Prisma `where`.
export async function projectTenantFilter(user: { id: number; role: string }): Promise<Prisma.ProjectWhereInput> {
  if (user.role === Role.SUPER_ADMIN) return {};
  if (user.role === Role.ENTREPRENEUR) return { entrepreneurId: user.id };

  const subPhaseIds = await getAssignedSubPhaseIds(user.id);
  return {
    OR: [
      { units: { some: { phases: { some: { subPhases: { some: { id: { in: subPhaseIds } } } } } } } },
      { participants: { some: { userId: user.id } } },
    ],
  };
}

// Ownership check for project mutations (and for Unit/Phase/SubPhase
// mutations once resolved up to their owning project). Does not admit
// COLLABORATORs — they never own/mutate a project directly.
export function assertProjectOwnership(project: ProjectOwnerFields | null, user: { id: number; role: string }): boolean {
  if (!project) return false;
  if (user.role === Role.SUPER_ADMIN) return true;
  if (user.role === Role.ENTREPRENEUR) return project.entrepreneurId === user.id;
  return false;
}

// Read-access check for a single project: same rule as GET /api/projects/:id
// — SUPER_ADMIN unrestricted, ENTREPRENEUR-owner, or a COLLABORATOR assigned
// to a sub-phase within the project or added as a ProjectParticipant.
export async function canAccessProject(project: ProjectRef, user: { id: number; role: string }): Promise<boolean> {
  if (assertProjectOwnership(project, user)) return true;
  if (user.role !== Role.COLLABORATOR) return false;

  const subPhaseIds = await getAssignedSubPhaseIds(user.id);
  if (subPhaseIds.length > 0) {
    const match = await prisma.project.findFirst({
      where: {
        id: project.id,
        units: { some: { phases: { some: { subPhases: { some: { id: { in: subPhaseIds } } } } } } },
      },
      select: { id: true },
    });
    if (match) return true;
  }

  const isParticipant = await prisma.projectParticipant.findFirst({
    where: { projectId: project.id, userId: user.id },
  });
  return isParticipant !== null;
}

export function assertUserOwnership(
  targetUser: { createdById: number | null },
  actor: { id: number; role: string }
): boolean {
  if (actor.role === Role.SUPER_ADMIN) return true;
  if (actor.role === Role.ENTREPRENEUR) return targetUser.createdById === actor.id;
  return false;
}

export function userTenantFilter(actor: { id: number; role: string }): Prisma.UserWhereInput {
  if (actor.role === Role.SUPER_ADMIN) return {};
  return { OR: [{ id: actor.id }, { createdById: actor.id }] };
}

// Resolve the owning project for Unit/Phase/SubPhase mutations, so callers
// can run assertProjectOwnership()/canAccessProject() against one shape.
export async function getProjectForUnit(unitId: number): Promise<ProjectRef | null> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { project: { select: { id: true, entrepreneurId: true } } },
  });
  return unit?.project ?? null;
}

export async function getProjectForPhase(phaseId: number): Promise<ProjectRef | null> {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { unit: { select: { project: { select: { id: true, entrepreneurId: true } } } } },
  });
  return phase?.unit.project ?? null;
}

export async function getProjectForSubPhase(subPhaseId: number): Promise<ProjectRef | null> {
  const subPhase = await prisma.subPhase.findUnique({
    where: { id: subPhaseId },
    select: { phase: { select: { unit: { select: { project: { select: { id: true, entrepreneurId: true } } } } } } },
  });
  return subPhase?.phase.unit.project ?? null;
}
