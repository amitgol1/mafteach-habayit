import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Phase, Project } from "../api/types";
import { Layout } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";

function activePhase(project: Project): Phase | null {
  const phases = project.units.flatMap((u) => u.phases).sort((a, b) => a.order - b.order);
  return phases.find((p) => p.status === "IN_PROGRESS") ?? phases.find((p) => p.status !== "COMPLETED") ?? null;
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => {
      setProjects(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
      </div>
      {loading && <p className="text-gray-500">Loading...</p>}
      {!loading && projects.length === 0 && <p className="text-gray-500">No projects yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => {
          const phase = activePhase(project);
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-medium text-gray-900">{project.name}</h2>
                  <p className="text-sm text-gray-500">{project.location}</p>
                </div>
                <StatusBadge status={project.overallStatus} />
              </div>
              <p className="text-sm text-gray-600 mt-3">
                Active phase: <span className="font-medium">{phase ? phase.name : "None"}</span>
              </p>
            </Link>
          );
        })}
      </div>
    </Layout>
  );
}
