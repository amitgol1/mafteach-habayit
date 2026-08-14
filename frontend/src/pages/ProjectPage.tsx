import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { FinancialsTab } from "../components/FinancialsTab";
import { Layout } from "../components/Layout";
import { ProjectTree } from "../components/ProjectTree";
import { SubPhaseFeed } from "../components/SubPhaseFeed";

type Tab = "overview" | "financials";

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedSubPhaseId, setSelectedSubPhaseId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    api.get<Project>(`/projects/${id}`).then((res) => setProject(res.data));
  }, [id]);

  if (!project) {
    return (
      <Layout>
        <p className="text-gray-500">Loading...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500">{project.location}</p>
      </div>

      {user?.role === "ADMIN" && (
        <div className="flex gap-4 border-b border-gray-200 mb-6">
          {(["overview", "financials"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize border-b-2 ${
                tab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-6">
          <ProjectTree
            project={project}
            selectedSubPhaseId={selectedSubPhaseId}
            onSelectSubPhase={setSelectedSubPhaseId}
          />
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 h-[600px]">
            {selectedSubPhaseId ? (
              <SubPhaseFeed subPhaseId={selectedSubPhaseId} />
            ) : (
              <p className="text-gray-400 text-sm">Select a sub-phase to view its feed.</p>
            )}
          </div>
        </div>
      )}

      {tab === "financials" && user?.role === "ADMIN" && <FinancialsTab projectId={project.id} />}
    </Layout>
  );
}
