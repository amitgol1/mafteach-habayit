import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Project, Unit } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { FinancialsTab } from "../components/FinancialsTab";
import { Layout } from "../components/Layout";
import { ProjectEditForm } from "../components/ProjectEditForm";
import { ProjectTree } from "../components/ProjectTree";
import { StageTracker } from "../components/StageTracker";
import { StatusBadge } from "../components/StatusBadge";
import { SubPhaseFeed } from "../components/SubPhaseFeed";
import { UpdatesFeed } from "../components/UpdatesFeed";

type Tab = "overview" | "financials";

const tabLabels: Record<Tab, string> = {
  overview: "סקירה",
  financials: "כספים",
};

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedSubPhaseId, setSelectedSubPhaseId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isManager = user?.role === "SUPER_ADMIN" || user?.role === "ENTREPRENEUR";
  const visibleTabs: Tab[] = isManager ? ["overview", "financials"] : ["overview"];

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

  function appendUnits(units: Unit[]) {
    setProject((prev) => (prev ? { ...prev, units: [...prev.units, ...units] } : prev));
  }

  async function handleDelete() {
    if (!project) return;
    if (
      !window.confirm(
        `למחוק את הפרויקט "${project.name}"? פעולה זו תמחק גם את כל היחידות, השלבים, תת-השלבים, העדכונים והנתונים הפיננסיים שלו. לא ניתן לבטל.`
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await api.delete(`/projects/${project.id}`);
      navigate("/");
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "אירעה שגיאה במחיקת הפרויקט";
      setDeleteError(message);
    }
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
        {isManager && (
          <div className="flex flex-wrap items-start gap-2">
            <button type="button" onClick={() => setEditing((prev) => !prev)} className="btn btn-ghost">
              {editing ? "ביטול עריכה" : "ערוך פרויקט"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="btn border-brick/30 text-brick-deep hover:bg-brick-tint"
            >
              מחק פרויקט
            </button>
            {deleteError && (
              <p className="w-full rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <StageTracker currentStage={project.currentStage} />
      </div>

      {isManager && editing && (
        <ProjectEditForm
          project={project}
          onSaved={() => {
            fetchProject();
            setEditing(false);
          }}
        />
      )}

      {visibleTabs.length > 1 && (
        <div className="mb-6 flex gap-1 border-b border-limestone-deep">
          {visibleTabs.map((t) => (
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
            isManager={isManager}
            selectedSubPhaseId={selectedSubPhaseId}
            onSelectSubPhase={setSelectedSubPhaseId}
            onChanged={fetchProject}
            onUnitsGenerated={appendUnits}
          />
          <div className="panel h-[32rem] p-4 md:h-[38rem]">
            {selectedSubPhaseId ? (
              <SubPhaseFeed subPhaseId={selectedSubPhaseId} />
            ) : (
              <UpdatesFeed feedPath={`/projects/${project.id}/updates`} />
            )}
          </div>
        </div>
      )}

      {tab === "financials" && isManager && <FinancialsTab projectId={project.id} project={project} />}
    </Layout>
  );
}
