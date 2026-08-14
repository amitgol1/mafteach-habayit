import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { FinancialSummary } from "../api/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function FinancialsTab({ projectId }: { projectId: number }) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    api.get<FinancialSummary>(`/projects/${projectId}/financials`).then((res) => setSummary(res.data));
  }

  useEffect(reload, [projectId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amountPaid) return;
    setSaving(true);
    const formData = new FormData();
    formData.append("amountPaid", amountPaid);
    const file = fileRef.current?.files?.[0];
    if (file) formData.append("receipt", file);

    try {
      await api.post(`/projects/${projectId}/financials`, formData);
      setAmountPaid("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } finally {
      setSaving(false);
    }
  }

  if (!summary) return <p className="text-sm text-ink-soft">טוען...</p>;

  const totals = [
    { label: "סה״כ לתשלום", value: summary.totals.totalDue, tone: "text-ink", edge: "panel-edge" },
    { label: "שולם", value: summary.totals.totalPaid, tone: "text-eucalyptus-deep", edge: "panel-edge" },
    { label: "יתרה לתשלום", value: summary.totals.remaining, tone: "text-brick-deep", edge: "panel-edge-brass" },
  ];

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
          <input id="receipt" ref={fileRef} type="file" accept="image/*" className="file-field" />
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "שומר..." : "הוספת תשלום"}
        </button>
      </form>

      <div className="panel divide-y divide-limestone p-0">
        {summary.records.length === 0 && <p className="p-4 text-sm text-ink-faint">אין תשלומים עדיין</p>}
        {summary.records.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="numeric text-ink">{currency.format(r.amountPaid)}</p>
              <time className="numeric text-xs text-ink-faint" dateTime={r.timestamp}>
                {new Date(r.timestamp).toLocaleString("he-IL")}
              </time>
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
        ))}
      </div>
    </div>
  );
}
