import type { PhaseStatus } from "../api/types";

const styles: Record<PhaseStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

const labels: Record<PhaseStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export function StatusBadge({ status }: { status: PhaseStatus }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
