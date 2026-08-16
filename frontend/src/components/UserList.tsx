import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Role, Trade, User } from "../api/types";
import { roleLabel, roleLabels, roles, tradeLabel, tradeLabels, trades } from "../constants/labels";

interface UserListProps {
  refreshSignal: number;
}

export function UserList({ refreshSignal }: UserListProps) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  function reload() {
    setError(null);
    api
      .get<User[]>("/users")
      .then((res) => setUsers(res.data))
      .catch(() => setError("אירעה שגיאה בטעינת המשתמשים"));
  }

  useEffect(reload, [refreshSignal]);

  async function handleDelete(user: User) {
    if (!window.confirm(`למחוק את המשתמש "${user.name}"? הפעולה אינה הפיכה.`)) return;
    setError(null);
    try {
      await api.delete(`/users/${user.id}`);
      reload();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "אירעה שגיאה במחיקת המשתמש";
      setError(message);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-lg text-ink">משתמשים קיימים</h2>

      {error && (
        <p className="mb-3 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">
          {error}
        </p>
      )}

      {!users && <p className="text-sm text-ink-soft">טוען...</p>}

      {users && (
        <ul className="panel divide-y divide-limestone p-0">
          {users.length === 0 && <li className="p-4 text-sm text-ink-faint">אין משתמשים עדיין</li>}
          {users.map((user) => (
            <li key={user.id}>
              {editingId === user.id ? (
                <UserEditRow
                  user={user}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    reload();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="numeric text-xs text-ink-faint" dir="ltr">
                      {user.email}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {roleLabel(user.role)}
                      {user.trade && ` · ${tradeLabel(user.trade)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setEditingId(user.id)} className="btn btn-ghost">
                      ערוך
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      className="btn border-brick/30 text-brick-deep hover:bg-brick-tint"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface UserEditRowProps {
  user: User;
  onCancel: () => void;
  onSaved: () => void;
}

function UserEditRow({ user, onCancel, onSaved }: UserEditRowProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [trade, setTrade] = useState<Trade | "">((user.trade as Trade) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch<User>(`/users/${user.id}`, {
        name: name.trim(),
        role,
        trade: trade || null,
      });
      onSaved();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "אירעה שגיאה בעדכון המשתמש";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 bg-blueprint-tint/30 p-3">
      <p className="numeric text-xs text-ink-faint" dir="ltr">
        {user.email}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="form-label" htmlFor={`edit-name-${user.id}`}>
            שם מלא (עריכה)
          </label>
          <input
            id={`edit-name-${user.id}`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-field"
          />
        </div>
        <div>
          <label className="form-label" htmlFor={`edit-role-${user.id}`}>
            הרשאת מערכת (עריכה)
          </label>
          <select
            id={`edit-role-${user.id}`}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="form-field"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor={`edit-trade-${user.id}`}>
            תחום עיסוק (עריכה)
          </label>
          <select
            id={`edit-trade-${user.id}`}
            value={trade}
            onChange={(e) => setTrade(e.target.value as Trade | "")}
            className="form-field"
          >
            <option value="">ללא</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {tradeLabels[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">{error}</p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? "שומר..." : "שמור שינויים"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          ביטול
        </button>
      </div>
    </div>
  );
}
