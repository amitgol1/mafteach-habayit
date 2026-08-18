import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { phaseAssignments } from "../db/schema";

// Port of src/utils/subPhaseAccess.ts. Prisma's singleton `prisma` import
// becomes an explicit `db` param — there's no module-level DB handle in a
// Worker, each request builds its own from env.DB (see src/db/client.ts).
export async function getAssignedSubPhaseIds(db: Db, userId: number): Promise<number[]> {
  const assignments = await db
    .select({ subPhaseId: phaseAssignments.subPhaseId })
    .from(phaseAssignments)
    .where(eq(phaseAssignments.userId, userId));
  return assignments.map((a) => a.subPhaseId);
}

export async function isAssignedToSubPhase(db: Db, userId: number, subPhaseId: number): Promise<boolean> {
  const [assignment] = await db
    .select()
    .from(phaseAssignments)
    .where(and(eq(phaseAssignments.userId, userId), eq(phaseAssignments.subPhaseId, subPhaseId)))
    .limit(1);
  return assignment !== undefined;
}
