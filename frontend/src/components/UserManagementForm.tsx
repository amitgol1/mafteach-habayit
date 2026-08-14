import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Role, Trade, User } from "../api/types";
import { roleLabels, roles, tradeLabels, trades } from "../constants/labels";

export function UserManagementForm() {
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
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "אירעה שגיאה ביצירת המשתמש";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="text-right">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">הוספת משתמש חדש</h1>
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 max-w-lg">
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="name">
            שם מלא
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
          <label className="block text-sm text-gray-600 mb-1" htmlFor="email">
            אימייל / שם משתמש
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="password">
            סיסמה
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="role">
            הרשאת מערכת
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="trade">
            תחום עיסוק
          </label>
          <select
            id="trade"
            value={trade}
            onChange={(e) => setTrade(e.target.value as Trade | "")}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
          >
            <option value="">ללא</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {tradeLabels[t]}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-700 text-sm">{success}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-gray-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50"
        >
          {saving ? "שומר..." : "צור משתמש"}
        </button>
      </form>
    </div>
  );
}
