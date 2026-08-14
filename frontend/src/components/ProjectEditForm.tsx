import { api } from "../api/client";
import type { Project } from "../api/types";
import { ProjectFormFields, type ProjectFormPayload } from "./ProjectFormFields";

interface ProjectEditFormProps {
  project: Project;
  onSaved: () => void;
}

export function ProjectEditForm({ project, onSaved }: ProjectEditFormProps) {
  async function handleUpdate(payload: ProjectFormPayload) {
    await api.patch<Project>(`/projects/${project.id}`, payload);
    onSaved();
  }

  return (
    <div dir="rtl" className="text-right mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">עריכת פרויקט</h2>
      <ProjectFormFields
        initialValues={{
          name: project.name,
          location: project.location,
          owners: project.owners,
          totalBudget: project.totalBudget,
          currentStage: project.currentStage,
          participants: project.participants?.map((p) => ({ trade: p.trade, userId: p.userId })),
        }}
        submitLabel="שמור שינויים"
        savingLabel="שומר..."
        successMessage="הפרויקט עודכן בהצלחה"
        errorMessage="אירעה שגיאה בעדכון הפרויקט"
        alwaysIncludeParticipants
        onSubmit={handleUpdate}
      />
    </div>
  );
}
