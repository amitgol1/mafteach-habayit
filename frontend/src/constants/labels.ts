import type { PhaseStatus, ProjectStage, Role, Trade } from "../api/types";

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
  FENCES: "גדרות",
  FLOORING: "ריצוף",
  GARDEN_DEVELOPMENT: "פיתוח גינה",
  FENCE_DEVELOPMENT: "פיתוח גדרות",
  FINISHES: "גמרים",
  FORM_4: "טופס 4",
};

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "מנהל מערכת",
  ENTREPRENEUR: "יזם",
  COLLABORATOR: "איש מקצוע",
};

export const phaseStatusLabels: Record<PhaseStatus, string> = {
  NOT_STARTED: "טרם החל",
  IN_PROGRESS: "בביצוע",
  COMPLETED: "הושלם",
  BLOCKED: "מעוכב",
};

export const trades = Object.keys(tradeLabels) as Trade[];
export const projectStages = Object.keys(projectStageLabels) as ProjectStage[];
export const roles = Object.keys(roleLabels) as Role[];
export const phaseStatuses = Object.keys(phaseStatusLabels) as PhaseStatus[];

/**
 * Enum values arrive from the API as English strings that are wider than our
 * union types (e.g. `User.trade` is `string`), so look up defensively and fall
 * back to the raw value instead of rendering `undefined`.
 */
export function tradeLabel(trade: string | null | undefined): string | null {
  if (!trade) return null;
  return tradeLabels[trade as Trade] ?? trade;
}

export function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return roleLabels[role as Role] ?? role;
}

export function projectStageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  return projectStageLabels[stage as ProjectStage] ?? stage;
}
