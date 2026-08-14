import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { ProjectCreationForm } from "../components/ProjectCreationForm";
import { UserManagementForm } from "../components/UserManagementForm";

type Tab = "project" | "user";

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("project");

  if (user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <div dir="rtl" className="flex gap-4 border-b border-gray-200 mb-6 text-right">
        <button
          type="button"
          onClick={() => setTab("project")}
          className={`pb-2 text-sm font-medium border-b-2 ${
            tab === "project" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"
          }`}
        >
          יצירת פרויקט
        </button>
        <button
          type="button"
          onClick={() => setTab("user")}
          className={`pb-2 text-sm font-medium border-b-2 ${
            tab === "user" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"
          }`}
        >
          ניהול משתמשים
        </button>
      </div>

      {tab === "project" && <ProjectCreationForm />}
      {tab === "user" && <UserManagementForm />}
    </Layout>
  );
}
