import { PhaseStatus } from "../constants";

// Project.overallStatus is a computed, read-time rollup of Phase.status
// across every Unit of the project — never a stored/client-settable value.
// See docs decision: BLOCKED > IN_PROGRESS > all-COMPLETED > else NOT_STARTED
// (a mix of COMPLETED/NOT_STARTED with nothing IN_PROGRESS/BLOCKED rolls up
// to NOT_STARTED, confirmed by product owner).
export function computeOverallStatus(units: { phases: { status: string }[] }[]): string {
  const statuses = units.flatMap((u) => u.phases.map((p) => p.status));
  if (statuses.includes(PhaseStatus.BLOCKED)) return PhaseStatus.BLOCKED;
  if (statuses.includes(PhaseStatus.IN_PROGRESS)) return PhaseStatus.IN_PROGRESS;
  if (statuses.length > 0 && statuses.every((s) => s === PhaseStatus.COMPLETED)) return PhaseStatus.COMPLETED;
  return PhaseStatus.NOT_STARTED;
}
