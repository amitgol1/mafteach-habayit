import type { ProjectStage } from "../api/types";
import { projectStageLabel, projectStageLabels, projectStages } from "../constants/labels";

type StageState = "done" | "current" | "upcoming";

const markerStyles: Record<StageState, string> = {
  done: "bg-blueprint border-blueprint text-plaster",
  current: "bg-brass border-brass text-plaster ring-4 ring-brass/25",
  upcoming: "bg-plaster border-limestone-deep text-ink-faint",
};

const labelStyles: Record<StageState, string> = {
  done: "text-ink-soft",
  current: "text-brass-deep font-semibold",
  upcoming: "text-ink-faint",
};

const stateNames: Record<StageState, string> = {
  done: "הושלם",
  current: "בביצוע",
  upcoming: "טרם החל",
};

function Marker({ index, state }: { index: number; state: StageState }) {
  return (
    <span
      className={`numeric grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-medium transition-colors ${markerStyles[state]}`}
      title={stateNames[state]}
    >
      {index + 1}
    </span>
  );
}

function Connector({ filled, vertical }: { filled: boolean; vertical?: boolean }) {
  if (vertical) {
    return (
      <span
        aria-hidden="true"
        className={
          filled
            ? "w-0.5 flex-1 rounded-full bg-blueprint"
            : "w-0 flex-1 border-s border-dashed border-limestone-deep"
        }
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={
        filled ? "h-0.5 flex-1 rounded-full bg-blueprint" : "h-0 flex-1 border-t border-dashed border-limestone-deep"
      }
    />
  );
}

export function StageTracker({ currentStage }: { currentStage: ProjectStage | string | null }) {
  // -1 covers both "no stage set" and a legacy value outside the current list:
  // nothing is marked as reached rather than throwing.
  const currentIndex = currentStage ? projectStages.indexOf(currentStage as ProjectStage) : -1;
  const isUnknownStage = Boolean(currentStage) && currentIndex === -1;

  function stateOf(index: number): StageState {
    if (currentIndex === -1) return "upcoming";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "upcoming";
  }

  return (
    <section className="panel panel-edge-brass p-4 sm:p-5" aria-label="שלב הפרויקט">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow text-brass-deep">שלב הפרויקט</h2>
        {currentIndex === -1 ? (
          <p className="text-sm text-ink-faint">
            {isUnknownStage ? `שלב לא מוכר: ${currentStage}` : "טרם נקבע שלב"}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            <span className="font-display text-base text-ink">{projectStageLabel(currentStage)}</span>
            <span className="numeric text-ink-faint">
              {" · "}
              {currentIndex + 1}/{projectStages.length}
            </span>
          </p>
        )}
      </div>

      {/* Phone: the sequence runs down a plumb line. */}
      <ol className="sm:hidden">
        {projectStages.map((stage, index) => {
          const state = stateOf(index);
          return (
            <li key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Marker index={index} state={state} />
                {index < projectStages.length - 1 && (
                  <Connector vertical filled={currentIndex > -1 && index < currentIndex} />
                )}
              </div>
              <span className={`pt-1.5 text-sm ${labelStyles[state]} ${index < projectStages.length - 1 ? "pb-4" : ""}`}>
                {projectStageLabels[stage]}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Tablet and up: the same markers set out along a horizontal line. */}
      <ol className="hidden sm:flex sm:items-start">
        {projectStages.map((stage, index) => {
          const state = stateOf(index);
          return (
            <li key={stage} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {index > 0 ? (
                  <Connector filled={currentIndex > -1 && index <= currentIndex} />
                ) : (
                  <span className="flex-1" aria-hidden="true" />
                )}
                <Marker index={index} state={state} />
                {index < projectStages.length - 1 ? (
                  <Connector filled={currentIndex > -1 && index < currentIndex} />
                ) : (
                  <span className="flex-1" aria-hidden="true" />
                )}
              </div>
              <span className={`mt-2 px-1 text-center text-[11px] leading-tight ${labelStyles[state]}`}>
                {projectStageLabels[stage]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
