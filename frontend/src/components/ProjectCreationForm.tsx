import { api } from "../api/client";
import type { Project } from "../api/types";
import { ProjectFormFields, type ProjectFormPayload } from "./ProjectFormFields";

export function ProjectCreationForm() {
  async function handleCreate(payload: ProjectFormPayload) {
    await api.post<Project>("/projects", payload);
  }

  return (
    <div dir="rtl" className="text-right">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">יצירת פרויקט חדש</h1>
      <ProjectFormFields
        submitLabel="צור פרויקט"
        savingLabel="שומר..."
        successMessage="הפרויקט נוצר בהצלחה"
        errorMessage="אירעה שגיאה ביצירת הפרויקט"
        resetOnSuccess
        onSubmit={handleCreate}
      />
    </div>
  );
}
