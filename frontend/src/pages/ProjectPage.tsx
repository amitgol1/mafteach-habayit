import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { FinancialsTab } from "../components/FinancialsTab";
import { Layout } from "../components/Layout";
import { ProjectEditForm } from "../components/ProjectEditForm";
import { ProjectTree } from "../components/ProjectTree";
import { StageTracker } from "../components/StageTracker";
import { StatusBadge } from "../components/StatusBadge";
import { SubPhaseFeed } from "../components/SubPhaseFeed";

type Tab = "overview" | "financials";

const tabLabels: Record<Tab, string> = {
  overview: "סקירה",
  financials: "כספים",
};

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedSubPhaseId, setSelectedSubPhaseId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  function fetchProject() {
    setLoadError(false);
    api
      .get<Project>(`/projects/${id}`)
      .then((res) => setProject(res.data))
      .catch(() => setLoadError(true));
  }

  if (loadError) {
    return (
      <Layout>
        <p className="text-sm text-brick-deep">אירעה שגיאה בטעינת הפרויקט. נסו לרענן את הדף.</p>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <p className="text-sm text-ink-soft">טוען...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl text-ink sm:text-3xl">{project.name}</h1>
            <StatusBadge status={project.overallStatus} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">{project.location}</p>
        </div>
        {user?.role === "ADMIN" && (
          <button type="button" onClick={() => setEditing((prev) => !prev)} className="btn btn-ghost">
            {editing ? "ביטול עריכה" : "ערוך פרויקט"}
          </button>
        )}
      </div>

      <div className="mb-6">
        <StageTracker currentStage={project.currentStage} />
      </div>

      {user?.role === "ADMIN" && editing && (
        <ProjectEditForm
          project={project}
          onSaved={() => {
            fetchProject();
            setEditing(false);
          }}
        />
      )}

      {user?.role === "ADMIN" && (
        <div className="mb-6 flex gap-1 border-b border-limestone-deep">
          {(["overview", "financials"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative px-4 pb-2.5 text-sm font-medium transition-colors ${
                tab === t ? "text-ink" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              {tabLabels[t]}
              {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brass" />}
            </button>
          ))}
        </div>
      )}

      {tab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          <ProjectTree
            project={project}
            selectedSubPhaseId={selectedSubPhaseId}
            onSelectSubPhase={setSelectedSubPhaseId}
          />
          <div className="panel h-[32rem] p-4 md:h-[38rem]">
            {selectedSubPhaseId ? (
              <SubPhaseFeed subPhaseId={selectedSubPhaseId} />
            ) : (
              <div className="grid h-full place-items-center text-center">
                <p className="max-w-[15rem] text-sm text-ink-faint">בחרו תת-שלב מהעץ כדי לראות את יומן העדכונים.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "financials" && user?.role === "ADMIN" && <FinancialsTab projectId={project.id} />}
    </Layout>
  );
}
