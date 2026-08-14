import { api } from "../api/client";
import type { Project } from "../api/types";
import { ProjectFormFields, type ProjectFormPayload } from "./ProjectFormFields";

export function ProjectCreationForm() {
  async function handleCreate(payload: ProjectFormPayload) {
    await api.post<Project>("/projects", payload);
  }

  return (
    <div>
      <p className="eyebrow text-brass-deep">ניהול</p>
      <h1 className="mt-1 mb-4 font-display text-2xl text-ink sm:text-3xl">יצירת פרויקט חדש</h1>
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
