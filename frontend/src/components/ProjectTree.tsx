import type { Project } from "../api/types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  project: Project;
  selectedSubPhaseId: number | null;
  onSelectSubPhase: (id: number) => void;
}

export function ProjectTree({ project, selectedSubPhaseId, onSelectSubPhase }: Props) {
  return (
    <div className="space-y-5">
      {project.units.map((unit) => (
        <div key={unit.id}>
          <h3 className="eyebrow mb-2 text-brass-deep">{unit.identifier}</h3>
          <div className="space-y-2">
            {[...unit.phases]
              .sort((a, b) => a.order - b.order)
              .map((phase) => (
                <div key={phase.id} className="panel overflow-hidden p-0">
                  <div className="flex items-center justify-between gap-2 border-b border-limestone bg-blueprint-tint/40 px-3 py-2">
                    <span className="truncate font-medium text-ink">{phase.name}</span>
                    <StatusBadge status={phase.status} />
                  </div>
                  <ul className="divide-y divide-limestone">
                    {phase.subPhases.map((subPhase) => {
                      const selected = selectedSubPhaseId === subPhase.id;
                      return (
                        <li key={subPhase.id}>
                          <button
                            type="button"
                            onClick={() => onSelectSubPhase(subPhase.id)}
                            aria-current={selected}
                            className={`flex w-full items-center justify-between gap-2 border-s-2 px-3 py-2 text-start transition-colors ${
                              selected
                                ? "border-s-brass bg-brass-tint/40"
                                : "border-s-transparent hover:bg-limestone/50"
                            }`}
                          >
                            <span className={`truncate text-sm ${selected ? "font-medium text-ink" : "text-ink-soft"}`}>
                              {subPhase.name}
                            </span>
                            <StatusBadge status={subPhase.status} />
                          </button>
                        </li>
                      );
                    })}
                    {phase.subPhases.length === 0 && (
                      <li className="px-3 py-2 text-sm text-ink-faint">אין תת-שלבים</li>
                    )}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      ))}
      {project.units.length === 0 && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-ink-soft">אין יחידות עדיין</p>
        </div>
      )}
    </div>
  );
}
