import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { Role, PhaseStatus, MediaType, Trade, ProjectStage } from "../constants";

// Drizzle translation of prisma/schema.prisma for the Cloudflare D1 POC.
// D1/SQLite has no native enum support (same constraint Prisma hit) — these
// fields hold string constants enforced in application code, see
// src/constants.ts. `.$type<...>()` below gives compile-time checking only,
// it adds no DB-level constraint (matches the Prisma original, which relied
// on the same app-level enforcement).
// Role: "SUPER_ADMIN" | "ENTREPRENEUR" | "COLLABORATOR"
// PhaseStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED"
// MediaType: "IMAGE" | "VIDEO" | "DOCUMENT"
// Trade: "ARCHITECT" | "CONSTRUCTION_ENGINEER" | "INTERIOR_DESIGNER" | "ELECTRICIAN"
//        | "PLUMBER" | "COMMUNICATIONS_TECHNICIAN" | "MAIN_CONTRACTOR"
// ProjectStage: "SKELETON" | "ELECTRICITY" | "PLUMBING" | "PLASTER" | "FENCES"
//               | "FLOORING" | "GARDEN_DEVELOPMENT" | "FENCE_DEVELOPMENT"
//               | "FINISHES" | "FORM_4"
//
// Timestamp storage: Prisma's `DateTime @default(now())` on SQLite declares
// a DATETIME column with a SQL-level `DEFAULT CURRENT_TIMESTAMP`, but writes
// via Prisma Client. D1 is a brand-new database for this POC (not a
// migration target for the existing dev.db), so there's no on-disk format to
// stay byte-compatible with. Columns below use
// `integer(..., { mode: "timestamp" })`, Drizzle's standard SQLite/D1
// timestamp representation (unix epoch seconds, exposed as a JS Date), with
// `default(sql\`(unixepoch())\`)` as the SQL-level default — the closest
// equivalent to Prisma's `now()` default for this dialect.

export const users = sqliteTable(
  "User",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("passwordHash").notNull(),
    role: text("role").$type<Role>().notNull(),
    trade: text("trade").$type<Trade>(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    // who created this user (SUPER_ADMIN creates ENTREPRENEURs, ENTREPRENEUR
    // creates COLLABORATORs); null for bootstrap/seed-created users
    createdById: integer("createdById").references((): AnySQLiteColumn => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("User_email_key").on(table.email),
    index("User_createdById_idx").on(table.createdById),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [users.createdById],
    references: [users.id],
    relationName: "UserCreatedBy",
  }),
  createdUsers: many(users, { relationName: "UserCreatedBy" }),
  assignments: many(phaseAssignments),
  updates: many(updates),
  participants: many(projectParticipants),
  projects: many(projects),
}));

export const projects = sqliteTable(
  "Project",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    location: text("location").notNull(),
    overallStatus: text("overallStatus").$type<PhaseStatus>().notNull().default("NOT_STARTED"),
    owners: text("owners"),
    totalBudget: real("totalBudget"),
    currentStage: text("currentStage").$type<ProjectStage>(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    // owning ENTREPRENEUR; required — every project has exactly one
    // paying-client owner, see team-lead contract
    entrepreneurId: integer("entrepreneurId")
      .notNull()
      .references((): AnySQLiteColumn => users.id, { onDelete: "restrict" }),
  },
  (table) => [index("Project_entrepreneurId_idx").on(table.entrepreneurId)],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  entrepreneur: one(users, { fields: [projects.entrepreneurId], references: [users.id] }),
  units: many(units),
  financialRecords: many(financialRecords),
  participants: many(projectParticipants),
  updates: many(updates),
}));

export const units = sqliteTable(
  "Unit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    identifier: text("identifier").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("Unit_projectId_idx").on(table.projectId)],
);

export const unitsRelations = relations(units, ({ one, many }) => ({
  project: one(projects, { fields: [units.projectId], references: [projects.id] }),
  phases: many(phases),
}));

export const phases = sqliteTable(
  "Phase",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").$type<PhaseStatus>().notNull().default("NOT_STARTED"),
    order: integer("order").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("Phase_unitId_idx").on(table.unitId)],
);

export const phasesRelations = relations(phases, ({ one, many }) => ({
  unit: one(units, { fields: [phases.unitId], references: [units.id] }),
  subPhases: many(subPhases),
  financialRecords: many(financialRecords),
}));

export const subPhases = sqliteTable(
  "SubPhase",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    phaseId: integer("phaseId")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").$type<PhaseStatus>().notNull().default("NOT_STARTED"),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("SubPhase_phaseId_idx").on(table.phaseId)],
);

export const subPhasesRelations = relations(subPhases, ({ one, many }) => ({
  phase: one(phases, { fields: [subPhases.phaseId], references: [phases.id] }),
  assignments: many(phaseAssignments),
  updates: many(updates),
}));

export const phaseAssignments = sqliteTable(
  "PhaseAssignment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subPhaseId: integer("subPhaseId")
      .notNull()
      .references(() => subPhases.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("PhaseAssignment_userId_subPhaseId_key").on(table.userId, table.subPhaseId),
    index("PhaseAssignment_subPhaseId_idx").on(table.subPhaseId),
  ],
);

export const phaseAssignmentsRelations = relations(phaseAssignments, ({ one }) => ({
  user: one(users, { fields: [phaseAssignments.userId], references: [users.id] }),
  subPhase: one(subPhases, {
    fields: [phaseAssignments.subPhaseId],
    references: [subPhases.id],
  }),
}));

export const projectParticipants = sqliteTable(
  "ProjectParticipant",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // one slot per trade per project, see src/constants.ts
    trade: text("trade").$type<Trade>().notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("ProjectParticipant_projectId_trade_key").on(table.projectId, table.trade),
    index("ProjectParticipant_userId_idx").on(table.userId),
  ],
);

export const projectParticipantsRelations = relations(projectParticipants, ({ one }) => ({
  project: one(projects, {
    fields: [projectParticipants.projectId],
    references: [projects.id],
  }),
  user: one(users, { fields: [projectParticipants.userId], references: [users.id] }),
}));

export const updates = sqliteTable(
  "Update",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // exactly one of subPhaseId / projectId is set — enforced by route
    // design, not a DB constraint (see team-lead contract)
    subPhaseId: integer("subPhaseId").references(() => subPhases.id, { onDelete: "cascade" }),
    projectId: integer("projectId").references(() => projects.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // short title; optional, see team-lead contract for validation rule
    subject: text("subject"),
    // free-text body; was "messageText" — renamed for clarity now that
    // subject exists alongside it
    description: text("description"),
    // local path under /uploads on Express; R2 object key under this POC
    mediaUrl: text("mediaUrl"),
    mediaType: text("mediaType").$type<MediaType>(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("Update_subPhaseId_idx").on(table.subPhaseId),
    index("Update_projectId_idx").on(table.projectId),
  ],
);

export const updatesRelations = relations(updates, ({ one }) => ({
  subPhase: one(subPhases, { fields: [updates.subPhaseId], references: [subPhases.id] }),
  project: one(projects, { fields: [updates.projectId], references: [projects.id] }),
  user: one(users, { fields: [updates.userId], references: [users.id] }),
}));

export const financialRecords = sqliteTable(
  "FinancialRecord",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phaseId: integer("phaseId").references(() => phases.id, { onDelete: "set null" }),
    amountPaid: real("amountPaid").notNull().default(0),
    // local path under /uploads on Express; R2 object key under this POC
    receiptMediaUrl: text("receiptMediaUrl"),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("FinancialRecord_projectId_idx").on(table.projectId),
    index("FinancialRecord_phaseId_idx").on(table.phaseId),
  ],
);

export const financialRecordsRelations = relations(financialRecords, ({ one }) => ({
  project: one(projects, { fields: [financialRecords.projectId], references: [projects.id] }),
  phase: one(phases, { fields: [financialRecords.phaseId], references: [phases.id] }),
}));
