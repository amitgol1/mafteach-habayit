import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { ProjectCreationForm } from "../components/ProjectCreationForm";
import { UserManagementForm } from "../components/UserManagementForm";

type Tab = "project" | "user";

const tabLabels: Record<Tab, string> = {
  project: "יצירת פרויקט",
  user: "ניהול משתמשים",
};

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("project");

  if (user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <div className="mb-6 flex gap-1 border-b border-limestone-deep">
        {(["project", "user"] as Tab[]).map((t) => (
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

      {tab === "project" && <ProjectCreationForm />}
      {tab === "user" && <UserManagementForm />}
    </Layout>
  );
}
