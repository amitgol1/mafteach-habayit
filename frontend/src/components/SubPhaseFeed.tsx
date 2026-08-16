import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Update } from "../api/types";
import { tradeLabel } from "../constants/labels";

export function SubPhaseFeed({ subPhaseId }: { subPhaseId: number }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setLoading(true);
    setLoadError(false);
    api
      .get<Update[]>(`/sub-phases/${subPhaseId}/updates`)
      .then((res) => setUpdates(res.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subPhaseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!messageText.trim() && !file) return;

    setPosting(true);
    const formData = new FormData();
    if (messageText.trim()) formData.append("messageText", messageText.trim());
    if (file) formData.append("media", file);

    try {
      await api.post(`/sub-phases/${subPhaseId}/updates`, formData);
      setMessageText("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="eyebrow mb-3 text-brass-deep">יומן עדכונים</h3>

      <div className="mb-3 flex-1 space-y-3 overflow-y-auto">
        {loading && <p className="text-sm text-ink-soft">טוען...</p>}
        {loadError && <p className="text-sm text-brick-deep">אירעה שגיאה בטעינת העדכונים.</p>}
        {!loading && !loadError && updates.length === 0 && (
          <p className="text-sm text-ink-faint">אין עדכונים עדיין</p>
        )}
        {updates.map((u) => {
          const trade = tradeLabel(u.user.trade);
          return (
            <article key={u.id} className="rounded-lg border border-limestone-deep bg-white p-3 shadow-panel">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-ink">
                  {u.user.name}
                  {trade ? <span className="font-normal text-ink-faint"> · {trade}</span> : ""}
                </span>
                <time className="numeric shrink-0 text-ink-faint" dateTime={u.timestamp}>
                  {new Date(u.timestamp).toLocaleString("he-IL")}
                </time>
              </div>
              {u.messageText && <p className="text-sm leading-relaxed text-ink">{u.messageText}</p>}
              {u.mediaUrl && u.mediaType === "IMAGE" && (
                <img src={u.mediaUrl} alt="" className="mt-2 max-h-64 rounded-lg border border-limestone object-contain" />
              )}
              {u.mediaUrl && u.mediaType === "VIDEO" && (
                <video src={u.mediaUrl} controls className="mt-2 max-h-64 rounded-lg border border-limestone" />
              )}
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-limestone-deep pt-3">
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="כתבו עדכון..."
          rows={2}
          className="form-field resize-none text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="file-field" />
          <button type="submit" disabled={posting} className="btn btn-primary">
            {posting ? "שולח..." : "שליחה"}
          </button>
        </div>
      </form>
    </div>
  );
}
