import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Phase, Project } from "../api/types";
import { Layout } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { projectStageLabel } from "../constants/labels";

function activePhase(project: Project): Phase | null {
  const phases = project.units.flatMap((u) => u.phases).sort((a, b) => a.order - b.order);
  return phases.find((p) => p.status === "IN_PROGRESS") ?? phases.find((p) => p.status !== "COMPLETED") ?? null;
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<Project[]>("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="mb-6">
        <p className="eyebrow text-brass-deep">סקירה כללית</p>
        <h1 className="mt-1 font-display text-2xl text-ink sm:text-3xl">הפרויקטים שלי</h1>
      </div>

      {loading && <p className="text-sm text-ink-soft">טוען...</p>}
      {error && <p className="text-sm text-brick-deep">אירעה שגיאה בטעינת הפרויקטים. נסו לרענן את הדף.</p>}
      {!loading && !error && projects.length === 0 && (
        <div className="panel p-8 text-center">
          <p className="text-sm text-ink-soft">אין פרויקטים עדיין</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => {
          const phase = activePhase(project);
          const stage = projectStageLabel(project.currentStage);
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="panel panel-edge block p-4 transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg text-ink">{project.name}</h2>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">{project.location}</p>
                </div>
                <StatusBadge status={project.overallStatus} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-limestone pt-3 text-sm">
                <div className="min-w-0">
                  <dt className="eyebrow text-ink-faint">שלב פעיל</dt>
                  <dd className="mt-0.5 truncate font-medium text-ink">{phase ? phase.name : "אין"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="eyebrow text-ink-faint">שלב הפרויקט</dt>
                  <dd className="mt-0.5 truncate font-medium text-brass-deep">{stage ?? "טרם נקבע"}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </Layout>
  );
}
