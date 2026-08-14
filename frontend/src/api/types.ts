export type Role = "ADMIN" | "COLLABORATOR";
export type PhaseStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
export type MediaType = "IMAGE" | "VIDEO";
export type Trade =
  | "ARCHITECT"
  | "CONSTRUCTION_ENGINEER"
  | "INTERIOR_DESIGNER"
  | "ELECTRICIAN"
  | "PLUMBER"
  | "COMMUNICATIONS_TECHNICIAN"
  | "MAIN_CONTRACTOR";
export type ProjectStage =
  | "SKELETON"
  | "ELECTRICITY"
  | "PLUMBING"
  | "PLASTER"
  | "FENCES"
  | "FLOORING"
  | "GARDEN_DEVELOPMENT"
  | "FENCE_DEVELOPMENT"
  | "FINISHES"
  | "FORM_4";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  trade: string | null;
}

export interface SubPhase {
  id: number;
  phaseId: number;
  name: string;
  status: PhaseStatus;
}

export interface Phase {
  id: number;
  unitId: number;
  name: string;
  status: PhaseStatus;
  order: number;
  subPhases: SubPhase[];
}

export interface Unit {
  id: number;
  projectId: number;
  identifier: string;
  phases: Phase[];
}

export interface ProjectParticipant {
  id: number;
  projectId: number;
  userId: number;
  trade: Trade;
  user: { id: number; name: string; trade: string | null };
}

export interface Project {
  id: number;
  name: string;
  location: string;
  overallStatus: PhaseStatus;
  owners: string | null;
  totalBudget: number | null;
  currentStage: ProjectStage | null;
  createdAt: string;
  units: Unit[];
  participants?: ProjectParticipant[];
}

export interface Update {
  id: number;
  subPhaseId: number;
  userId: number;
  messageText: string | null;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  timestamp: string;
  user: { id: number; name: string; role: Role; trade: string | null };
}

export interface FinancialRecord {
  id: number;
  projectId: number;
  phaseId: number | null;
  amountPaid: number;
  receiptMediaUrl: string | null;
  timestamp: string;
}

export interface FinancialSummary {
  records: FinancialRecord[];
  totals: { totalPaid: number; totalDue: number; remaining: number };
}
