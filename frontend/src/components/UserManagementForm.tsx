import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Role, Trade, User } from "../api/types";
import { roleLabels, roles, tradeLabels, trades } from "../constants/labels";

interface UserManagementFormProps {
  onCreated?: () => void;
}

export function UserManagementForm({ onCreated }: UserManagementFormProps = {}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("COLLABORATOR");
  const [trade, setTrade] = useState<Trade | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      await api.post<User>("/users", {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        trade: trade || undefined,
      });
      setSuccess("המשתמש נוצר בהצלחה");
      setName("");
      setEmail("");
      setPassword("");
      setRole("COLLABORATOR");
      setTrade("");
      onCreated?.();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "אירעה שגיאה ביצירת המשתמש";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-brass-deep">ניהול</p>
      <h1 className="mt-1 mb-4 font-display text-2xl text-ink sm:text-3xl">הוספת משתמש חדש</h1>

      <form onSubmit={handleSubmit} className="panel panel-edge max-w-lg space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="form-label" htmlFor="name">
              שם מלא
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
            <label className="form-label" htmlFor="email">
              אימייל / שם משתמש
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-field text-start"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="password">
              סיסמה
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-field text-start"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="role">
              הרשאת מערכת
            </label>
            <select
              id="role"
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
            <label className="form-label" htmlFor="trade">
              תחום עיסוק
            </label>
            <select
              id="trade"
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
        {success && (
          <p className="rounded-lg border border-eucalyptus/30 bg-eucalyptus-tint px-3 py-2 text-sm text-eucalyptus-deep">
            {success}
          </p>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "שומר..." : "צור משתמש"}
        </button>
      </form>
    </div>
  );
}
