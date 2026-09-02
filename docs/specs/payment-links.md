# Payment → Unit / Phase / Sub-phase links — contract spec

Feature: let a `FinancialRecord` (a payment) link to a specific `Unit`,
`Phase`, or `SubPhase`, in addition to the existing project-level/general
option (nothing picked). Today `phaseId` exists on the model but the add-
payment form never exposes it — this is the first time any of these links
become reachable from the UI.

This is a first planning pass — nothing below has been confirmed with the
user yet except the parts explicitly marked "confirmed with the user" in the
originating task. See section 5 for what still needs a product decision
before be-developer/fe-developer start.

## 1. Schema change (done — see files below)

`backend/prisma/schema.prisma`: added two nullable FKs to `FinancialRecord`,
alongside the existing `phaseId`:

```prisma
model FinancialRecord {
  id              Int      @id @default(autoincrement())
  projectId       Int
  unitId          Int? // at most one of unitId/phaseId/subPhaseId is set — enforced by route validation, not a DB constraint (see team-lead contract); none of the three = project-level/general payment
  phaseId         Int?
  subPhaseId      Int?
  amountPaid      Float    @default(0)
  receiptMediaUrl String?
  timestamp       DateTime @default(now())

  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  unit     Unit?     @relation(fields: [unitId], references: [id], onDelete: SetNull)
  phase    Phase?    @relation(fields: [phaseId], references: [id], onDelete: SetNull)
  subPhase SubPhase? @relation(fields: [subPhaseId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([unitId])
  @@index([phaseId])
  @@index([subPhaseId])
}
```

Plus the required inverse relations: `Unit.financialRecords` and
`SubPhase.financialRecords` (mirroring `Phase.financialRecords`, which
already existed).

Migration:
`backend/prisma/migrations/20260902055811_add_financial_record_unit_subphase_links/migration.sql`

Generated with `prisma migrate dev --create-only` against a throwaway scratch
SQLite file (not `dev.db`, which does not even exist in this worktree — see
note below), so the SQL matches exactly what Prisma would generate, rather
than being hand-written. Prisma did a `RedefineTable` (SQLite can't add a
column with a `REFERENCES` constraint via plain `ALTER TABLE ADD COLUMN`,
same reason the earlier `add_tenant_scoping_nullable` migration used the same
pattern) — it rebuilds `FinancialRecord` with the two new nullable columns,
copies existing rows across (their `unitId`/`subPhaseId` come back `NULL`,
`phaseId` preserved), and re-adds all four indexes. Purely additive at the
data level: no existing row loses data, no existing `phaseId` link is
touched. **Not applied to any database** — same convention as the prior
spec: run `npx prisma migrate dev` deliberately when ready, not as part of
this design pass.

Note on worktree state: this worktree has no `backend/.env` and no
`dev.db` file at all (confirmed before touching anything) — it's fully
isolated from the live app's real database, so generating the migration via
a real (throwaway, scratch) Prisma run here carried zero risk to real data.
The scratch file and stray directory Prisma's shadow-migration process
created were deleted after use; `git status` in `backend/prisma/` now shows
only the schema diff and the new migration folder.

### Why `unitId` + `subPhaseId` as siblings of `phaseId`, not derived via joins

Considered only adding `subPhaseId` and deriving `phase`/`unit` via the
existing `subPhase → phase → unit` chain, rejected: that can only represent
a payment tied to a specific sub-phase. The user explicitly wants unit-level
and phase-level linkage too — a payment for "the roof phase of Unit 3" isn't
always attributable to one particular sub-phase (e.g. a lump-sum roofing
contractor payment covering multiple sub-phases, or a phase with no
sub-phases yet). A join-derived design can't represent "linked to this phase,
no sub-phase specified" or "linked to this unit, no phase specified" at all.
Three sibling nullable FKs — mirroring how `phaseId` already exists as a
sibling of `projectId` — is the only shape that represents all four states
product asked for (project-level, unit-level, phase-level, sub-phase-level)
without forcing every payment to the deepest level of the tree.

### "At most one", not "exactly one"

The task framing (and the `Update` model precedent) says "exactly one of
several optional FKs is set". For `Update`, that's literally true — every
update is either about a sub-phase or about the project, never neither.
`FinancialRecord` is different: the existing project-level/general payment
(nothing picked) is a valid, common state — it's the *only* state the
current UI produces today, since the add-payment form has never exposed a
phase picker. So the rule here is **at most one of `unitId`/`phaseId`/
`subPhaseId` may be set — zero is valid and means project-level.** This
mirrors `Update`'s "not a DB constraint, enforced by route design" approach,
not its "always exactly one" cardinality.

## 2. Validation — `POST /projects/:projectId/financials`

Mirrors the existing ownership-check style in `backend/src/routes/financial.ts`
and `units.ts`, reusing the existing `getProjectForUnit` /
`getProjectForPhase` / `getProjectForSubPhase` helpers from
`backend/src/utils/tenantScope.ts` (already imported by `units.ts` for the
same purpose: resolving a target ID's owning project).

After the existing project-ownership check (unchanged — actor must own
`:projectId`), add:

1. **Cardinality.** Parse `unitId`, `phaseId`, `subPhaseId` from
   `req.body` the same way `phaseId` is parsed today (multipart form field,
   string or absent — falsy/empty string means "not set", same as the
   current `phaseId ? Number(phaseId) : null` pattern). If more than one of
   the three is truthy → `400`
   `{ error: "at most one of unitId, phaseId, or subPhaseId may be set" }`.
2. **Well-formed IDs.** Any of the three that's present but not
   `Number.isFinite` after `Number(...)` → `400`
   `{ error: "<field> must be a number" }`. (Guards against e.g.
   `getProjectForPhase(NaN)` reaching Prisma with a garbage id.)
3. **Belongs to this project.** For whichever one field is set, resolve its
   owning project via the matching helper and compare `.id` to the route's
   `:projectId`:
   ```ts
   if (unitIdNum !== null) {
     const owner = await getProjectForUnit(unitIdNum);
     if (!owner || owner.id !== projectId) {
       res.status(400).json({ error: "unitId does not belong to this project" });
       return;
     }
   }
   // same shape for phaseIdNum via getProjectForPhase, subPhaseIdNum via getProjectForSubPhase
   ```
   `400`, not `404`/`403` — this is validating an incidental field of the
   resource being created, not resolving a mutation's primary target (that's
   the existing `404 Project not found` / `403 Not authorized` pair above
   it, unchanged). Keeps a single error-status convention for "bad request
   body" on this route (matches the cardinality check above).

`prisma.financialRecord.create({ data: { ..., unitId: unitIdNum, phaseId:
phaseIdNum, subPhaseId: subPhaseIdNum, ... } })` — all three, whichever is
non-null, the rest `null`.

No new validation needed on `DELETE /financial-records/:id` — unchanged, and
no validation needed on `GET /projects/:projectId/financials` — unchanged,
returns all scalar fields including the two new ones automatically (Prisma
returns all model scalar columns by default; no `select`/`include` was
needed for `phaseId` today and none is needed for `unitId`/`subPhaseId`).

## 3. API contract — request/response shapes

`POST /projects/:projectId/financials` (`multipart/form-data`, unchanged
`upload.single("receipt")`):

- Body gains two new optional string fields: `unitId?: string`,
  `subPhaseId?: string`, alongside the existing `phaseId?: string`.
- Response: `201` with the created `FinancialRecord` — same shape as today,
  now including `unitId: number | null` and `subPhaseId: number | null` as
  plain scalar fields (no route code needs to add them to a `select`, Prisma
  includes all scalars by default — same reason `phaseId` already appears in
  today's response with zero extra code).

`GET /projects/:projectId/financials` — **no backend shape change needed
beyond the two new scalar fields showing up automatically.** Decision: do
**not** add nested `unit`/`phase`/`subPhase` name objects via `include`.
Reasoning:

- This matches the existing convention for `Update` (`backend/src/routes/updates.ts`):
  its responses only `include: { user: ... }`, never a resolved `subPhase`/
  `project` name — the frontend already has that context from data it
  independently loaded, and looks names up locally rather than the backend
  denormalizing them into every response.
- `frontend/src/pages/ProjectPage.tsx` already loads the full `Project`
  object — `project.units[].phases[].subPhases[]`, each with `identifier`/
  `name` — before rendering `FinancialsTab`. Nested names in the financials
  response would be 100% redundant with data the page already has in state.

**Frontend consumption implication (for fe-developer, not a backend change):**
`FinancialsTab` currently only receives `{ projectId }` as a prop
(`frontend/src/pages/ProjectPage.tsx:129`:
`<FinancialsTab projectId={project.id} />`). To resolve `unitId`/`phaseId`/
`subPhaseId` on each record to a displayable label, and to build an add-
payment picker, `FinancialsTab` needs the `project` (or at minimum
`project.units`) passed down too — `ProjectPage.tsx` already holds `project`
in scope, so this is a prop-plumbing change, not a new fetch.

`frontend/src/api/types.ts` — `FinancialRecord` interface gains:

```ts
export interface FinancialRecord {
  id: number;
  projectId: number;
  unitId: number | null;
  phaseId: number | null;
  subPhaseId: number | null;
  amountPaid: number;
  receiptMediaUrl: string | null;
  timestamp: string;
}
```

## 4. Files touched / to touch

Done in this pass (team-lead):
- `backend/prisma/schema.prisma` — `FinancialRecord.unitId`,
  `FinancialRecord.subPhaseId`, inverse relations on `Unit`/`SubPhase`
- `backend/prisma/migrations/20260902055811_add_financial_record_unit_subphase_links/migration.sql`
- this spec: `docs/specs/payment-links.md`

Not yet applied: `npx prisma migrate dev` — run deliberately, not as part of
routine dev work.

For be-developer:
- `backend/src/routes/financial.ts` — section 2 (validation) + section 3
  (`POST` body handling)
- new/extended Vitest file under `backend/tests/` covering: valid
  unit-only/phase-only/subphase-only/none payments, the "more than one set"
  400, the "belongs to a different project" 400, and the malformed-id 400

For fe-developer:
- `frontend/src/api/types.ts` — `FinancialRecord` per section 3
- `frontend/src/components/FinancialsTab.tsx` — accept `project` (or
  `project.units`) as a prop instead of just `projectId`; add a picker to
  the add-payment form (unit / phase / sub-phase / none — exact UX is
  fe-developer's call per section 5); display the link per payment row
  (resolve the set ID against `project.units` tree to a label)
- `frontend/src/pages/ProjectPage.tsx` — pass `project` to `FinancialsTab`
- new/extended Playwright spec under `frontend/e2e/` covering: adding a
  payment linked to each of unit/phase/sub-phase/none, and that the link
  displays correctly

## 5. Flagged for user/product review — not decided here

1. **Picker UX granularity.** Should the add-payment form offer one
   cascading tree picker (pick a unit, then optionally narrow to one of its
   phases, then optionally to one of that phase's sub-phases — the final
   selection is what gets sent) or a flatter "link to:" dropdown listing
   every unit/phase/sub-phase in the project by full path
   (e.g. "בית 1 › שלד › מרתף")? This is a UX call, not an engineering one —
   flagging so product picks before fe-developer builds it.
2. **Editing a payment's link after creation.** There is currently no
   `PATCH /financial-records/:id` — only `POST` (create) and `DELETE`. If a
   user mis-links a payment (wrong unit/phase), today's only fix is delete +
   recreate. Is that acceptable, or does this feature need an edit endpoint
   too? Out of scope for this pass unless product wants it now.
3. **Per-unit / per-phase totals.** The current financial summary
   (`totalDue`/`totalPaid`/`remaining`) is project-level only, derived from
   `project.totalBudget` and a flat sum of all records. This feature only
   captures *which* records are linked to what — it does **not** add
   "paid per unit" or "paid per phase" breakdowns to the summary. That's a
   materially bigger feature (would need per-unit/per-phase budget figures,
   which don't exist on the schema today — only `Project.totalBudget`).
   Flagging as optional follow-up scope, not building it now.
4. **Listing/filtering payments by unit/phase/sub-phase.** `GET
   /projects/:projectId/financials` returns all records for the project,
   unpaginated, same as today. No query-param filtering is being added — the
   frontend already has everything in memory to filter client-side if
   product wants a filtered view (e.g. "show only payments for Unit 2").
   Flag only if payment volume per project is expected to grow large enough
   that unpaginated-plus-client-filter stops being adequate — not a concern
   at today's scale.
