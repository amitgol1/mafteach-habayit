import type { PhaseStatus } from "../api/types";
import { phaseStatusLabels } from "../constants/labels";

const styles: Record<PhaseStatus, string> = {
  NOT_STARTED: "bg-limestone text-ink-soft border-limestone-deep",
  IN_PROGRESS: "bg-brass-tint text-brass-deep border-brass/35",
  COMPLETED: "bg-eucalyptus-tint text-eucalyptus-deep border-eucalyptus/30",
  BLOCKED: "bg-brick-tint text-brick-deep border-brick/30",
};

const dots: Record<PhaseStatus, string> = {
  NOT_STARTED: "bg-limestone-deep",
  IN_PROGRESS: "bg-brass",
  COMPLETED: "bg-eucalyptus",
  BLOCKED: "bg-brick",
};

export function StatusBadge({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[status]}`} />
      {phaseStatusLabels[status] ?? status}
    </span>
  );
}
