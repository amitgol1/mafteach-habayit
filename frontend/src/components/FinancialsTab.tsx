import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { FinancialSummary } from "../api/types";

export function FinancialsTab({ projectId }: { projectId: number }) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [totalDue, setTotalDue] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    api.get<FinancialSummary>(`/projects/${projectId}/financials`).then((res) => setSummary(res.data));
  }

  useEffect(reload, [projectId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!totalDue) return;
    setSaving(true);
    const formData = new FormData();
    formData.append("totalDue", totalDue);
    if (amountPaid) formData.append("amountPaid", amountPaid);
    const file = fileRef.current?.files?.[0];
    if (file) formData.append("receipt", file);

    try {
      await api.post(`/projects/${projectId}/financials`, formData);
      setAmountPaid("");
      setTotalDue("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } finally {
      setSaving(false);
    }
  }

  if (!summary) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total due</p>
          <p className="text-xl font-semibold text-gray-900">{summary.totals.totalDue.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total paid</p>
          <p className="text-xl font-semibold text-green-700">{summary.totals.totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Remaining</p>
          <p className="text-xl font-semibold text-red-700">{summary.totals.remaining.toLocaleString()}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-gray-900">Add financial record</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="totalDue">
              Total due
            </label>
            <input
              id="totalDue"
              type="number"
              step="0.01"
              required
              value={totalDue}
              onChange={(e) => setTotalDue(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="amountPaid">
              Amount paid
            </label>
            <input
              id="amountPaid"
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Receipt</label>
          <input ref={fileRef} type="file" accept="image/*" className="text-sm" />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-gray-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add record"}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {summary.records.length === 0 && <p className="p-4 text-sm text-gray-400">No records yet.</p>}
        {summary.records.map((r) => (
          <div key={r.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <p className="text-gray-800">
                Paid {r.amountPaid.toLocaleString()} / {r.totalDue.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">{new Date(r.timestamp).toLocaleString()}</p>
            </div>
            {r.receiptMediaUrl && (
              <a href={r.receiptMediaUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                Receipt
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
