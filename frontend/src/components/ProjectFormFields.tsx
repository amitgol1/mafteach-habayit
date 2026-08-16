import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { ProjectStage, Trade, User } from "../api/types";
import { projectStages, projectStageLabels, tradeLabels, trades } from "../constants/labels";

export interface ProjectFormPayload {
  name: string;
  location: string;
  owners?: string;
  totalBudget?: number;
  currentStage?: ProjectStage;
  participants?: { trade: Trade; userId: number }[];
}

export interface ProjectFormInitialValues {
  name?: string;
  location?: string;
  owners?: string | null;
  totalBudget?: number | null;
  currentStage?: ProjectStage | null;
  participants?: { trade: Trade; userId: number }[];
}

interface ProjectFormFieldsProps {
  initialValues?: ProjectFormInitialValues;
  submitLabel: string;
  savingLabel: string;
  successMessage: string;
  errorMessage: string;
  resetOnSuccess?: boolean;
  /** When true, always includes `participants` in the payload (even if empty), so submit replaces the full set. */
  alwaysIncludeParticipants?: boolean;
  onSubmit: (payload: ProjectFormPayload) => Promise<void>;
}

export function ProjectFormFields({
  initialValues,
  submitLabel,
  savingLabel,
  successMessage,
  errorMessage,
  resetOnSuccess = false,
  alwaysIncludeParticipants = false,
  onSubmit,
}: ProjectFormFieldsProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [owners, setOwners] = useState(initialValues?.owners ?? "");
  const [totalBudget, setTotalBudget] = useState(
    initialValues?.totalBudget != null ? String(initialValues.totalBudget) : ""
  );
  const [currentStage, setCurrentStage] = useState<ProjectStage | "">(initialValues?.currentStage ?? "");
  const [usersByTrade, setUsersByTrade] = useState<Partial<Record<Trade, User[]>>>({});
  const [selectedUserByTrade, setSelectedUserByTrade] = useState<Partial<Record<Trade, number>>>(() => {
    const map: Partial<Record<Trade, number>> = {};
    for (const p of initialValues?.participants ?? []) map[p.trade] = p.userId;
    return map;
  });
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoadingUsers(true);
    setUsersLoadError(false);
    Promise.all(
      trades.map((trade) =>
        api.get<User[]>("/users/by-trade", { params: { trade } }).then((res) => [trade, res.data] as const)
      )
    )
      .then((results) => {
        const map: Partial<Record<Trade, User[]>> = {};
        for (const [trade, users] of results) map[trade] = users;
        setUsersByTrade(map);
      })
      .catch(() => setUsersLoadError(true))
      .finally(() => setLoadingUsers(false));
  }, []);

  function handleTradeChange(trade: Trade, value: string) {
    setSelectedUserByTrade((prev) => {
      const next = { ...prev };
      if (value) next[trade] = Number(value);
      else delete next[trade];
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    const participants = trades
      .filter((trade) => selectedUserByTrade[trade] != null)
      .map((trade) => ({ trade, userId: selectedUserByTrade[trade]! }));

    try {
      await onSubmit({
        name: name.trim(),
        location: location.trim(),
        owners: owners.trim() || undefined,
        totalBudget: totalBudget ? Number(totalBudget) : undefined,
        currentStage: currentStage || undefined,
        participants: participants.length > 0 || alwaysIncludeParticipants ? participants : undefined,
      });
      setSuccess(successMessage);
      if (resetOnSuccess) {
        setName("");
        setLocation("");
        setOwners("");
        setTotalBudget("");
        setCurrentStage("");
        setSelectedUserByTrade({});
      }
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? errorMessage;
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel panel-edge space-y-5 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="name">
            שם הפרויקט
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-field"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="location">
            מיקום
          </label>
          <input
            id="location"
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="form-field"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="owners">
            לקוחות / יזמים
          </label>
          <input
            id="owners"
            type="text"
            value={owners}
            onChange={(e) => setOwners(e.target.value)}
            className="form-field"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="totalBudget">
            תקציב כולל
          </label>
          <input
            id="totalBudget"
            type="number"
            step="0.01"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            className="form-field numeric"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="currentStage">
            שלב נוכחי
          </label>
          <select
            id="currentStage"
            value={currentStage}
            onChange={(e) => setCurrentStage(e.target.value as ProjectStage | "")}
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
      </div>

      <div className="border-t border-limestone pt-4">
        <h2 className="eyebrow mb-3 text-brass-deep">צוות הפרויקט</h2>
        {loadingUsers && <p className="text-sm text-ink-soft">טוען משתמשים...</p>}
        {usersLoadError && <p className="text-sm text-brick-deep">אירעה שגיאה בטעינת המשתמשים.</p>}
        {!loadingUsers && !usersLoadError && (
          <div className="grid gap-4 sm:grid-cols-2">
            {trades.map((trade) => {
              const users = usersByTrade[trade] ?? [];
              return (
                <div key={trade}>
                  <label className="form-label" htmlFor={`trade-${trade}`}>
                    {tradeLabels[trade]}
                  </label>
                  <select
                    id={`trade-${trade}`}
                    value={selectedUserByTrade[trade] ?? ""}
                    onChange={(e) => handleTradeChange(trade, e.target.value)}
                    disabled={users.length === 0}
                    className="form-field"
                  >
                    <option value="">{users.length === 0 ? "אין משתמשים בתחום זה" : "לא נבחר"}</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">{error}</p>
      )}
      {success && (
        <p className="rounded-lg border border-eucalyptus/30 bg-eucalyptus-tint px-3 py-2 text-sm text-eucalyptus-deep">
          {success}
        </p>
      )}

      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
