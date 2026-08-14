import type { Project } from "../api/types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  project: Project;
  selectedSubPhaseId: number | null;
  onSelectSubPhase: (id: number) => void;
}

export function ProjectTree({ project, selectedSubPhaseId, onSelectSubPhase }: Props) {
  return (
    <div className="space-y-4">
      {project.units.map((unit) => (
        <div key={unit.id}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{unit.identifier}</h3>
          <div className="space-y-2">
            {[...unit.phases]
              .sort((a, b) => a.order - b.order)
              .map((phase) => (
                <div key={phase.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                    <span className="font-medium text-gray-900">{phase.name}</span>
                    <StatusBadge status={phase.status} />
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {phase.subPhases.map((subPhase) => (
                      <li key={subPhase.id}>
                        <button
                          type="button"
                          onClick={() => onSelectSubPhase(subPhase.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${
                            selectedSubPhaseId === subPhase.id ? "bg-blue-50" : ""
                          }`}
                        >
                          <span className="text-sm text-gray-800">{subPhase.name}</span>
                          <StatusBadge status={subPhase.status} />
                        </button>
                      </li>
                    ))}
                    {phase.subPhases.length === 0 && (
                      <li className="px-3 py-2 text-sm text-gray-400">No sub-phases</li>
                    )}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      ))}
      {project.units.length === 0 && <p className="text-gray-500 text-sm">No units yet.</p>}
    </div>
  );
}
