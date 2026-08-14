import { prisma } from "../prisma";

export async function getAssignedSubPhaseIds(userId: number): Promise<number[]> {
  const assignments = await prisma.phaseAssignment.findMany({
    where: { userId },
    select: { subPhaseId: true },
  });
  return assignments.map((a) => a.subPhaseId);
}

export async function isAssignedToSubPhase(userId: number, subPhaseId: number): Promise<boolean> {
  const assignment = await prisma.phaseAssignment.findUnique({
    where: { userId_subPhaseId: { userId, subPhaseId } },
  });
  return assignment !== null;
}
