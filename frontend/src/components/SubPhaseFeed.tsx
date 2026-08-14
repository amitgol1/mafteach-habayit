import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Update } from "../api/types";

export function SubPhaseFeed({ subPhaseId }: { subPhaseId: number }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setLoading(true);
    api.get<Update[]>(`/sub-phases/${subPhaseId}/updates`).then((res) => {
      setUpdates(res.data);
      setLoading(false);
    });
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {loading && <p className="text-gray-500 text-sm">Loading...</p>}
        {!loading && updates.length === 0 && <p className="text-gray-400 text-sm">No updates yet.</p>}
        {updates.map((u) => (
          <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>
                {u.user.name}
                {u.user.trade ? ` (${u.user.trade})` : ""}
              </span>
              <span>{new Date(u.timestamp).toLocaleString()}</span>
            </div>
            {u.messageText && <p className="text-sm text-gray-800">{u.messageText}</p>}
            {u.mediaUrl && u.mediaType === "IMAGE" && (
              <img src={u.mediaUrl} alt="" className="mt-2 rounded max-h-64 object-contain" />
            )}
            {u.mediaUrl && u.mediaType === "VIDEO" && (
              <video src={u.mediaUrl} controls className="mt-2 rounded max-h-64" />
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-gray-200 pt-3 space-y-2">
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Post an update..."
          rows={2}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="text-sm" />
          <button
            type="submit"
            disabled={posting}
            className="bg-gray-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </form>
    </div>
  );
}
