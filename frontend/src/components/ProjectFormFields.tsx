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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoadingUsers(true);
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
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="name">
            שם הפרויקט
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="location">
            מיקום
          </label>
          <input
            id="location"
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="owners">
            לקוחות / יזמים
          </label>
          <input
            id="owners"
            type="text"
            value={owners}
            onChange={(e) => setOwners(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="totalBudget">
            תקציב כולל
          </label>
          <input
            id="totalBudget"
            type="number"
            step="0.01"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="currentStage">
            סטטוס נוכחי
          </label>
          <select
            id="currentStage"
            value={currentStage}
            onChange={(e) => setCurrentStage(e.target.value as ProjectStage | "")}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
          >
            <option value="">בחר סטטוס</option>
            {projectStages.map((stage) => (
              <option key={stage} value={stage}>
                {projectStageLabels[stage]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h2 className="font-medium text-gray-900 mb-2">צוות הפרויקט</h2>
        {loadingUsers && <p className="text-gray-500 text-sm">טוען משתמשים...</p>}
        {!loadingUsers && (
          <div className="grid sm:grid-cols-2 gap-4">
            {trades.map((trade) => {
              const users = usersByTrade[trade] ?? [];
              return (
                <div key={trade}>
                  <label className="block text-sm text-gray-600 mb-1" htmlFor={`trade-${trade}`}>
                    {tradeLabels[trade]}
                  </label>
                  <select
                    id={`trade-${trade}`}
                    value={selectedUserByTrade[trade] ?? ""}
                    onChange={(e) => handleTradeChange(trade, e.target.value)}
                    disabled={users.length === 0}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-400"
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

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-700 text-sm">{success}</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-gray-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50"
      >
        {saving ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
