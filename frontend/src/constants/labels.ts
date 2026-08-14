import type { ProjectStage, Role, Trade } from "../api/types";

export const tradeLabels: Record<Trade, string> = {
  ARCHITECT: "אדריכל",
  CONSTRUCTION_ENGINEER: "מהנדס בניין",
  INTERIOR_DESIGNER: "מעצבת פנים",
  ELECTRICIAN: "חשמלאי",
  PLUMBER: "אינסטלטור",
  COMMUNICATIONS_TECHNICIAN: "איש תקשורת",
  MAIN_CONTRACTOR: "קבלן ראשי",
};

export const projectStageLabels: Record<ProjectStage, string> = {
  SKELETON: "שלד",
  ELECTRICITY: "חשמל",
  PLUMBING: "אינסטלציה",
  PLASTER: "טיח",
  FLOORING: "ריצוף",
  ALUMINUM: "אלומיניום",
  FENCES: "גדרות",
};

export const roleLabels: Record<Role, string> = {
  ADMIN: "מנהל עבודה",
  COLLABORATOR: "איש מקצוע",
};

export const trades = Object.keys(tradeLabels) as Trade[];
export const projectStages = Object.keys(projectStageLabels) as ProjectStage[];
export const roles = Object.keys(roleLabels) as Role[];
