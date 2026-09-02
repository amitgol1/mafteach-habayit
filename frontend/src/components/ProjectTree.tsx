import { useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api/client";
import type { PhaseStatus, ProjectStage, Project, ProjectType, Unit } from "../api/types";
import {
  phaseStatusLabels,
  phaseStatuses,
  projectStageLabel,
  projectStageLabels,
  projectStages,
  unitNamePrefixByProjectType,
} from "../constants/labels";
import { StatusBadge } from "./StatusBadge";

interface Props {
  project: Project;
  isManager: boolean;
  selectedSubPhaseId: number | null;
  onSelectSubPhase: (id: number | null) => void;
  onChanged: () => void;
  onUnitsGenerated: (units: Unit[]) => void;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
}

export function ProjectTree({
  project,
  isManager,
  selectedSubPhaseId,
  onSelectSubPhase,
  onChanged,
  onUnitsGenerated,
}: Props) {
  return (
    <div className="space-y-5" data-testid="project-tree">
      {project.units.map((unit) => (
        <UnitSection
          key={unit.id}
          unit={unit}
          allUnits={project.units}
          isManager={isManager}
          selectedSubPhaseId={selectedSubPhaseId}
          onSelectSubPhase={onSelectSubPhase}
          onChanged={onChanged}
        />
      ))}
      {project.units.length === 0 && (
        <div className="panel space-y-3 p-6 text-center">
          <p className="text-sm text-ink-soft">אין יחידות עדיין</p>
          {isManager && <AddUnitForm projectId={project.id} onAdded={onChanged} />}
        </div>
      )}
      {isManager && project.units.length > 0 && <AddUnitForm projectId={project.id} onAdded={onChanged} />}
      {isManager && project.projectType && (
        <GenerateUnitsForm
          projectId={project.id}
          projectType={project.projectType}
          currentUnitCount={project.units.length}
          onGenerated={onUnitsGenerated}
        />
      )}
    </div>
  );
}

interface UnitSectionProps {
  unit: Unit;
  allUnits: Unit[];
  isManager: boolean;
  selectedSubPhaseId: number | null;
  onSelectSubPhase: (id: number | null) => void;
  onChanged: () => void;
}

function UnitSection({ unit, allUnits, isManager, selectedSubPhaseId, onSelectSubPhase, onChanged }: UnitSectionProps) {
  return (
    <div>
      <UnitIdentifierLabel unit={unit} isManager={isManager} onChanged={onChanged} />
      <div className="space-y-2">
        {[...unit.phases]
          .sort((a, b) => a.order - b.order)
          .map((phase) => (
            <div key={phase.id} className="panel overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 border-b border-limestone bg-blueprint-tint/40 px-3 py-2">
                <span className="truncate font-medium text-ink">{projectStageLabel(phase.name)}</span>
                {isManager ? (
                  <StatusSelect
                    label={`סטטוס שלב: ${projectStageLabel(phase.name)}`}
                    status={phase.status}
                    onChange={async (status) => {
                      await api.patch(`/phases/${phase.id}`, { status });
                      onChanged();
                    }}
                  />
                ) : (
                  <StatusBadge status={phase.status} />
                )}
              </div>
              <ul className="divide-y divide-limestone">
                {phase.subPhases.map((subPhase) => {
                  const selected = selectedSubPhaseId === subPhase.id;
                  return (
                    <li key={subPhase.id}>
                      <div
                        className={`flex items-center justify-between gap-2 border-s-2 px-3 py-2 transition-colors ${
                          selected ? "border-s-brass bg-brass-tint/40" : "border-s-transparent hover:bg-limestone/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectSubPhase(selected ? null : subPhase.id)}
                          aria-current={selected}
                          className="min-w-0 flex-1 text-start"
                        >
                          <span className={`truncate text-sm ${selected ? "font-medium text-ink" : "text-ink-soft"}`}>
                            {subPhase.name}
                          </span>
                        </button>
                        {isManager ? (
                          <StatusSelect
                            label={`סטטוס תת-שלב: ${subPhase.name}`}
                            status={subPhase.status}
                            onChange={async (status) => {
                              await api.patch(`/sub-phases/${subPhase.id}`, { status });
                              onChanged();
                            }}
                          />
                        ) : (
                          <StatusBadge status={subPhase.status} />
                        )}
                      </div>
                    </li>
                  );
                })}
                {phase.subPhases.length === 0 && (
                  <li className="px-3 py-2 text-sm text-ink-faint">אין תת-שלבים</li>
                )}
              </ul>
              {isManager && (
                <div className="border-t border-limestone px-3 py-2">
                  <AddSubPhaseForm phaseId={phase.id} onAdded={onChanged} />
                </div>
              )}
            </div>
          ))}
      </div>
      {isManager && (
        <div className="mt-2">
          <AddPhaseForm defaultUnitId={unit.id} units={allUnits} onAdded={onChanged} />
        </div>
      )}
    </div>
  );
}

interface UnitIdentifierLabelProps {
  unit: Unit;
  isManager: boolean;
  onChanged: () => void;
}

function UnitIdentifierLabel({ unit, isManager, onChanged }: UnitIdentifierLabelProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unit.identifier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isManager) {
    return <h3 className="eyebrow mb-2 text-brass-deep">{unit.identifier}</h3>;
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `למחוק את היחידה "${unit.identifier}"? פעולה זו תמחק גם את כל השלבים ותת-השלבים שלה. לא ניתן לבטל.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/units/${unit.id}`);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה במחיקת היחידה"));
    }
  }

  if (!editing) {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="eyebrow text-brass-deep">{unit.identifier}</h3>
        <button
          type="button"
          onClick={() => {
            setValue(unit.identifier);
            setError(null);
            setEditing(true);
          }}
          className="text-xs text-ink-faint underline hover:text-ink-soft"
          aria-label={`עריכת שם היחידה ${unit.identifier}`}
        >
          עריכה
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="text-xs text-brick-deep underline hover:text-brick"
          aria-label={`מחיקת היחידה ${unit.identifier}`}
        >
          מחיקה
        </button>
        {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === unit.identifier) {
      setEditing(false);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/units/${unit.id}`, { identifier: trimmed });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה בעדכון שם היחידה"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        required
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`שם יחידה: ${unit.identifier}`}
        className="form-field w-auto max-w-48 py-0.5 text-sm"
      />
      <button type="submit" disabled={saving} className="btn btn-ghost text-xs">
        {saving ? "שומר..." : "שמירה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        className="btn btn-ghost text-xs"
      >
        ביטול
      </button>
      {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
    </form>
  );
}

interface StatusSelectProps {
  label: string;
  status: PhaseStatus;
  onChange: (status: PhaseStatus) => Promise<void>;
}

function StatusSelect({ label, status, onChange }: StatusSelectProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as PhaseStatus;
    setError(false);
    setSaving(true);
    try {
      await onChange(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <select
        aria-label={label}
        value={status}
        onChange={handleChange}
        disabled={saving}
        className="form-field w-auto rounded-full border-limestone-deep py-0.5 ps-2.5 pe-6 text-xs"
      >
        {phaseStatuses.map((s) => (
          <option key={s} value={s}>
            {phaseStatusLabels[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-brick-deep">שגיאה</span>}
    </div>
  );
}

interface AddUnitFormProps {
  projectId: number;
  onAdded: () => void;
}

function AddUnitForm({ projectId, onAdded }: AddUnitFormProps) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/units", { projectId, identifier: identifier.trim() });
      setIdentifier("");
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה בהוספת היחידה"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        + הוספת יחידה
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel panel-edge flex flex-wrap items-end gap-2 p-3">
      <div className="min-w-40 flex-1">
        <label className="form-label" htmlFor="new-unit-identifier">
          מזהה יחידה
        </label>
        <input
          id="new-unit-identifier"
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="form-field"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? "מוסיף..." : "הוספה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="btn btn-ghost"
      >
        ביטול
      </button>
      {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
    </form>
  );
}

interface GenerateUnitsFormProps {
  projectId: number;
  projectType: ProjectType;
  currentUnitCount: number;
  onGenerated: (units: Unit[]) => void;
}

function GenerateUnitsForm({ projectId, projectType, currentUnitCount, onGenerated }: GenerateUnitsFormProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(count);
    if (!n || n < 1) return;
    setError(null);
    setSaving(true);
    try {
      const prefix = unitNamePrefixByProjectType[projectType];
      const identifiers = Array.from({ length: n }, (_, i) => `${prefix} ${currentUnitCount + i + 1}`);
      // The bulk endpoint's response is `{ id, projectId, identifier, createdAt }`
      // per unit (no `phases`), so fill that in for the client-side Unit shape.
      const res = await api.post<Omit<Unit, "phases">[]>("/units/bulk", { projectId, identifiers });
      onGenerated(res.data.map((unit) => ({ ...unit, phases: [] })));
      setCount("1");
      setOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה ביצירת היחידות"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        + יצירת יחידות אוטומטית
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel panel-edge flex flex-wrap items-end gap-2 p-3">
      <div className="w-24">
        <label className="form-label" htmlFor="generate-units-count">
          מספר יחידות
        </label>
        <input
          id="generate-units-count"
          type="number"
          min={1}
          max={100}
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="form-field numeric"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? "יוצר..." : "יצירה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="btn btn-ghost"
      >
        ביטול
      </button>
      {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
    </form>
  );
}

interface AddPhaseFormProps {
  defaultUnitId: number;
  units: Unit[];
  onAdded: () => void;
}

function AddPhaseForm({ defaultUnitId, units, onAdded }: AddPhaseFormProps) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [name, setName] = useState<ProjectStage | "">("");
  const nextOrderForUnit = (id: number) => (units.find((u) => u.id === id)?.phases.length ?? 0) + 1;
  const [order, setOrder] = useState(String(nextOrderForUnit(defaultUnitId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleUnitChange(e: ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    setUnitId(id);
    setOrder(String(nextOrderForUnit(id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !order.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/phases", { unitId, name, order: Number(order) });
      setName("");
      setOrder(String(nextOrderForUnit(unitId) + 1));
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה בהוספת השלב"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        + הוספת שלב
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel panel-edge flex flex-wrap items-end gap-2 p-3">
      <div className="min-w-32 flex-1">
        <label className="form-label" htmlFor={`new-phase-unit-${defaultUnitId}`}>
          יחידה
        </label>
        <select
          id={`new-phase-unit-${defaultUnitId}`}
          required
          value={unitId}
          onChange={handleUnitChange}
          className="form-field"
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.identifier}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-40 flex-1">
        <label className="form-label" htmlFor={`new-phase-name-${defaultUnitId}`}>
          שלב
        </label>
        <select
          id={`new-phase-name-${defaultUnitId}`}
          required
          value={name}
          onChange={(e) => setName(e.target.value as ProjectStage | "")}
          className="form-field"
        >
          <option value="">בחרו שלב</option>
          {projectStages.map((stage) => (
            <option key={stage} value={stage}>
              {projectStageLabels[stage]}
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <label className="form-label" htmlFor={`new-phase-order-${defaultUnitId}`}>
          סדר
        </label>
        <input
          id={`new-phase-order-${defaultUnitId}`}
          type="number"
          required
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="form-field numeric"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? "מוסיף..." : "הוספה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="btn btn-ghost"
      >
        ביטול
      </button>
      {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
    </form>
  );
}

interface AddSubPhaseFormProps {
  phaseId: number;
  onAdded: () => void;
}

function AddSubPhaseForm({ phaseId, onAdded }: AddSubPhaseFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/sub-phases", { phaseId, name: name.trim() });
      setName("");
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(apiErrorMessage(err, "אירעה שגיאה בהוספת תת-השלב"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        + הוספת תת-שלב
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1">
        <label className="form-label" htmlFor={`new-subphase-name-${phaseId}`}>
          שם תת-השלב
        </label>
        <input
          id={`new-subphase-name-${phaseId}`}
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-field"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? "מוסיף..." : "הוספה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="btn btn-ghost"
      >
        ביטול
      </button>
      {error && <p className="w-full text-sm text-brick-deep">{error}</p>}
    </form>
  );
}
