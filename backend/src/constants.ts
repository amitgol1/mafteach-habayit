export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ENTREPRENEUR: "ENTREPRENEUR",
  COLLABORATOR: "COLLABORATOR",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PhaseStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  BLOCKED: "BLOCKED",
} as const;
export type PhaseStatus = (typeof PhaseStatus)[keyof typeof PhaseStatus];

export const MediaType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  DOCUMENT: "DOCUMENT",
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const Trade = {
  ARCHITECT: "ARCHITECT",
  CONSTRUCTION_ENGINEER: "CONSTRUCTION_ENGINEER",
  INTERIOR_DESIGNER: "INTERIOR_DESIGNER",
  ELECTRICIAN: "ELECTRICIAN",
  PLUMBER: "PLUMBER",
  COMMUNICATIONS_TECHNICIAN: "COMMUNICATIONS_TECHNICIAN",
  MAIN_CONTRACTOR: "MAIN_CONTRACTOR",
} as const;
export type Trade = (typeof Trade)[keyof typeof Trade];

export const ProjectStage = {
  SKELETON: "SKELETON",
  ELECTRICITY: "ELECTRICITY",
  PLUMBING: "PLUMBING",
  PLASTER: "PLASTER",
  FENCES: "FENCES",
  FLOORING: "FLOORING",
  GARDEN_DEVELOPMENT: "GARDEN_DEVELOPMENT",
  FENCE_DEVELOPMENT: "FENCE_DEVELOPMENT",
  FINISHES: "FINISHES",
  FORM_4: "FORM_4",
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];
