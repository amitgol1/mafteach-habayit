import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Update, UpdatesPage } from "../api/types";
import { tradeLabel } from "../constants/labels";

interface UpdatesFeedProps {
  feedPath: string;
}

export function UpdatesFeed({ feedPath }: UpdatesFeedProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setLoading(true);
    setLoadError(false);
    api
      .get<UpdatesPage>(feedPath)
      .then((res) => {
        setUpdates(res.data.updates);
        setNextCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedPath]);

  function loadMore() {
    if (nextCursor === null) return;
    setLoadingMore(true);
    api
      .get<UpdatesPage>(feedPath, { params: { before: nextCursor } })
      .then((res) => {
        setUpdates((prev) => [...prev, ...res.data.updates]);
        setNextCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoadingMore(false));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!subject.trim() && !description.trim() && !file) return;

    setPosting(true);
    setPostError(null);
    const formData = new FormData();
    if (subject.trim()) formData.append("subject", subject.trim());
    if (description.trim()) formData.append("description", description.trim());
    if (file) formData.append("media", file);

    try {
      await api.post(feedPath, formData);
      setSubject("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (err: any) {
      setPostError(err?.response?.data?.error ?? "אירעה שגיאה בשליחת העדכון.");
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
              {u.subject && <p className="font-semibold text-ink">{u.subject}</p>}
              {u.description && <p className="text-sm leading-relaxed text-ink">{u.description}</p>}
              {u.mediaUrl && u.mediaType === "IMAGE" && (
                <img src={u.mediaUrl} alt="" className="mt-2 max-h-64 rounded-lg border border-limestone object-contain" />
              )}
              {u.mediaUrl && u.mediaType === "VIDEO" && (
                <video src={u.mediaUrl} controls className="mt-2 max-h-64 rounded-lg border border-limestone" />
              )}
              {u.mediaUrl && u.mediaType === "DOCUMENT" && (
                <a
                  href={u.mediaUrl}
                  download
                  className="mt-2 flex items-center gap-2 rounded-lg border border-limestone bg-limestone/30 px-3 py-2 text-sm text-ink hover:bg-limestone/50"
                >
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" aria-hidden="true">
                    <path
                      d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  <span className="truncate">{u.mediaUrl.split("/").pop()}</span>
                </a>
              )}
              {u.mediaUrl && u.mediaType !== "DOCUMENT" && (
                <a
                  href={u.mediaUrl}
                  download
                  className="mt-2 inline-block text-sm font-medium text-blueprint underline-offset-4 hover:text-brass-deep hover:underline"
                >
                  הורדה
                </a>
              )}
            </article>
          );
        })}
        {hasMore && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-ghost w-full">
            {loadingMore ? "טוען..." : "טען עוד"}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-limestone-deep pt-3">
        {postError && <p className="text-sm text-brick-deep">{postError}</p>}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="נושא"
          className="form-field text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="תיאור..."
          rows={2}
          className="form-field resize-none text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="file-field"
          />
          <button type="submit" disabled={posting} className="btn btn-primary">
            {posting ? "שולח..." : "שליחה"}
          </button>
        </div>
      </form>
    </div>
  );
}
