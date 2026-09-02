import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api/client";
import type { FinancialRecord, FinancialSummary, Phase, Project, SubPhase, Unit } from "../api/types";
import { projectStageLabel } from "../constants/labels";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function sortedPhases(unit: Unit): Phase[] {
  return [...unit.phases].sort((a, b) => a.order - b.order);
}

interface RecordLink {
  unit: Unit;
  phase: Phase | null;
  subPhase: SubPhase | null;
}

interface Lookups {
  unitById: Map<number, Unit>;
  phaseToUnit: Map<number, Unit>;
  subPhaseToPhase: Map<number, Phase>;
}

function buildLookups(project: Project): Lookups {
  const unitById = new Map<number, Unit>();
  const phaseToUnit = new Map<number, Unit>();
  const subPhaseToPhase = new Map<number, Phase>();
  for (const unit of project.units) {
    unitById.set(unit.id, unit);
    for (const phase of unit.phases) {
      phaseToUnit.set(phase.id, unit);
      for (const subPhase of phase.subPhases) {
        subPhaseToPhase.set(subPhase.id, phase);
      }
    }
  }
  return { unitById, phaseToUnit, subPhaseToPhase };
}

function resolveRecordLink(record: FinancialRecord, lookups: Lookups): RecordLink | null {
  if (record.unitId != null) {
    const unit = lookups.unitById.get(record.unitId);
    return unit ? { unit, phase: null, subPhase: null } : null;
  }
  if (record.phaseId != null) {
    const unit = lookups.phaseToUnit.get(record.phaseId);
    if (!unit) return null;
    const phase = unit.phases.find((p) => p.id === record.phaseId) ?? null;
    return { unit, phase, subPhase: null };
  }
  if (record.subPhaseId != null) {
    const phase = lookups.subPhaseToPhase.get(record.subPhaseId);
    if (!phase) return null;
    const unit = lookups.phaseToUnit.get(phase.id);
    if (!unit) return null;
    const subPhase = phase.subPhases.find((sp) => sp.id === record.subPhaseId) ?? null;
    return { unit, phase, subPhase };
  }
  return null;
}

function describeLink(link: RecordLink): string {
  const parts = [link.unit.identifier];
  if (link.phase) parts.push(projectStageLabel(link.phase.name) ?? link.phase.name);
  if (link.subPhase) parts.push(link.subPhase.name);
  return parts.join(" › ");
}

interface UnitBreakdown {
  unit: Unit;
  total: number;
  phases: { phase: Phase; total: number }[];
}

function computeBreakdown(
  records: FinancialRecord[],
  project: Project,
  lookups: Lookups
): { unitBreakdowns: UnitBreakdown[]; generalTotal: number } {
  const unitTotals = new Map<number, number>();
  const phaseTotals = new Map<number, number>();
  let generalTotal = 0;

  for (const record of records) {
    const link = resolveRecordLink(record, lookups);
    if (!link) {
      generalTotal += record.amountPaid;
      continue;
    }
    unitTotals.set(link.unit.id, (unitTotals.get(link.unit.id) ?? 0) + record.amountPaid);
    if (link.phase) {
      phaseTotals.set(link.phase.id, (phaseTotals.get(link.phase.id) ?? 0) + record.amountPaid);
    }
  }

  const unitBreakdowns: UnitBreakdown[] = project.units
    .filter((unit) => unitTotals.has(unit.id))
    .map((unit) => ({
      unit,
      total: unitTotals.get(unit.id) ?? 0,
      phases: sortedPhases(unit)
        .filter((phase) => phaseTotals.has(phase.id))
        .map((phase) => ({ phase, total: phaseTotals.get(phase.id) ?? 0 })),
    }));

  return { unitBreakdowns, generalTotal };
}

export function FinancialsTab({ projectId, project }: { projectId: number; project: Project }) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [linkUnitId, setLinkUnitId] = useState("");
  const [linkPhaseId, setLinkPhaseId] = useState("");
  const [linkSubPhaseId, setLinkSubPhaseId] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setLoadError(false);
    api
      .get<FinancialSummary>(`/projects/${projectId}/financials`)
      .then((res) => setSummary(res.data))
      .catch(() => setLoadError(true));
  }

  useEffect(reload, [projectId]);

  const lookups = useMemo(() => buildLookups(project), [project]);
  const selectedUnit = useMemo(() => project.units.find((u) => String(u.id) === linkUnitId), [project, linkUnitId]);
  const selectedPhase = useMemo(
    () => selectedUnit?.phases.find((p) => String(p.id) === linkPhaseId),
    [selectedUnit, linkPhaseId]
  );

  function handleUnitChange(e: ChangeEvent<HTMLSelectElement>) {
    setLinkUnitId(e.target.value);
    setLinkPhaseId("");
    setLinkSubPhaseId("");
  }

  function handlePhaseChange(e: ChangeEvent<HTMLSelectElement>) {
    setLinkPhaseId(e.target.value);
    setLinkSubPhaseId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amountPaid) return;
    setSaving(true);
    const formData = new FormData();
    formData.append("amountPaid", amountPaid);
    if (linkSubPhaseId) formData.append("subPhaseId", linkSubPhaseId);
    else if (linkPhaseId) formData.append("phaseId", linkPhaseId);
    else if (linkUnitId) formData.append("unitId", linkUnitId);
    const file = fileRef.current?.files?.[0];
    if (file) formData.append("receipt", file);

    try {
      await api.post(`/projects/${projectId}/financials`, formData);
      setAmountPaid("");
      setLinkUnitId("");
      setLinkPhaseId("");
      setLinkSubPhaseId("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-brick-deep">אירעה שגיאה בטעינת הנתונים הכספיים.</p>;
  if (!summary) return <p className="text-sm text-ink-soft">טוען...</p>;

  const totals = [
    { label: "סה״כ לתשלום", value: summary.totals.totalDue, tone: "text-ink", edge: "panel-edge" },
    { label: "שולם", value: summary.totals.totalPaid, tone: "text-eucalyptus-deep", edge: "panel-edge" },
    { label: "יתרה לתשלום", value: summary.totals.remaining, tone: "text-brick-deep", edge: "panel-edge-brass" },
  ];

  const { unitBreakdowns, generalTotal } = computeBreakdown(summary.records, project, lookups);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {totals.map((item) => (
          <div key={item.label} className={`panel ${item.edge} p-4`}>
            <p className="eyebrow text-ink-faint">{item.label}</p>
            <p className={`numeric mt-1 text-xl font-semibold ${item.tone}`}>{currency.format(item.value)}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="panel space-y-4 p-4">
        <h3 className="font-display text-lg text-ink">הוספת תשלום</h3>
        <div>
          <label className="form-label" htmlFor="amountPaid">
            סכום ששולם
          </label>
          <input
            id="amountPaid"
            type="number"
            step="0.01"
            required
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className="form-field numeric"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="receipt">
            קבלה
          </label>
          <input
            id="receipt"
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="file-field"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="form-label" htmlFor="link-unit">
              יחידה
            </label>
            <select id="link-unit" value={linkUnitId} onChange={handleUnitChange} className="form-field">
              <option value="">כללי</option>
              {project.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.identifier}
                </option>
              ))}
            </select>
          </div>
          {selectedUnit && (
            <div>
              <label className="form-label" htmlFor="link-phase">
                שלב
              </label>
              <select id="link-phase" value={linkPhaseId} onChange={handlePhaseChange} className="form-field">
                <option value="">כל היחידה</option>
                {sortedPhases(selectedUnit).map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {projectStageLabel(phase.name)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedPhase && (
            <div>
              <label className="form-label" htmlFor="link-subphase">
                תת-שלב
              </label>
              <select
                id="link-subphase"
                value={linkSubPhaseId}
                onChange={(e) => setLinkSubPhaseId(e.target.value)}
                className="form-field"
              >
                <option value="">כל השלב</option>
                {selectedPhase.subPhases.map((subPhase) => (
                  <option key={subPhase.id} value={subPhase.id}>
                    {subPhase.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "שומר..." : "הוספת תשלום"}
        </button>
      </form>

      <div className="panel space-y-3 p-4" data-testid="financial-breakdown">
        <h3 className="font-display text-lg text-ink">פירוט תשלומים לפי יחידה</h3>
        {unitBreakdowns.length === 0 && (
          <p className="text-sm text-ink-faint">אין עדיין תשלומים המשויכים ליחידה</p>
        )}
        {unitBreakdowns.map(({ unit, total, phases }) => (
          <div key={unit.id} data-testid="unit-breakdown" className="border-s-2 border-s-brass ps-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{unit.identifier}</span>
              <span className="numeric text-sm font-medium text-ink">{currency.format(total)}</span>
            </div>
            {phases.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {phases.map(({ phase, total: phaseTotal }) => (
                  <li
                    key={phase.id}
                    data-testid="phase-breakdown"
                    className="flex items-center justify-between gap-2 text-sm text-ink-soft"
                  >
                    <span>{projectStageLabel(phase.name)}</span>
                    <span className="numeric">{currency.format(phaseTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div
          data-testid="general-breakdown"
          className="flex items-center justify-between gap-2 border-s-2 border-s-limestone-deep ps-3"
        >
          <span className="font-medium text-ink-soft">כללי</span>
          <span className="numeric text-sm font-medium text-ink-soft">{currency.format(generalTotal)}</span>
        </div>
      </div>

      <div className="panel divide-y divide-limestone p-0">
        {summary.records.length === 0 && <p className="p-4 text-sm text-ink-faint">אין תשלומים עדיין</p>}
        {summary.records.map((r) => {
          const link = resolveRecordLink(r, lookups);
          return (
            <div
              key={r.id}
              data-testid="financial-record"
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="numeric text-ink">{currency.format(r.amountPaid)}</p>
                <time className="numeric text-xs text-ink-faint" dateTime={r.timestamp}>
                  {new Date(r.timestamp).toLocaleString("he-IL")}
                </time>
                {link && <p className="text-xs font-medium text-brass-deep">{describeLink(link)}</p>}
              </div>
              {r.receiptMediaUrl && (
                <a
                  href={r.receiptMediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-blueprint underline-offset-4 hover:text-brass-deep hover:underline"
                >
                  צפייה בקבלה
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
