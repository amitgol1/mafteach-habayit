# Project type + auto-generated units — contract spec

Feature: entrepreneur sets a project type (residential building / private houses)
plus a count, and gets that many Units auto-created with default Hebrew names
("בית 1", "דירה 1", ...). Applies to new and existing projects. Count is
extendable later. Unit names stay free-text/editable after generation.

Confirmed with the user (not up for debate): retrofit-capable, count
extendable after creation, names auto-generated but freely renamable
afterward — `Unit.identifier` stays the free-text field it is today.

## 1. Schema change (done — see files below)

`backend/prisma/schema.prisma`: added one nullable field to `Project`:

```prisma
projectType String? // ProjectType vocabulary, see src/constants.ts; null = not set (legacy/retrofit projects keep today's free-text Unit flow)
```

No field was added for unit count — see decision below.

Migration: `backend/prisma/migrations/20260901120000_add_project_type/migration.sql`

```sql
-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectType" TEXT;
```

Purely additive: one nullable column on `Project`, no `Unit` table changes.
Existing `Unit` rows and their `identifier` values are untouched. Not yet
applied to `dev.db` — run `npx prisma migrate dev` deliberately when ready,
per repo convention (do not run it as part of this design pass).

### Why no `unitCount` field on `Project`

Considered storing `unitCount` on `Project` and rejected it: `Unit` rows are
already freely created (`POST /units`), renamed (`PATCH /units/:id`), and
deleted (`DELETE /units/:id`) outside of any "generate" flow, and none of
those existing endpoints would know to keep a separate `unitCount` counter in
sync. A stored count next to the real rows is two sources of truth that
drift the moment someone adds/removes a unit by hand — which the existing UI
already allows today. The actual count is always `units.length`; nothing
new needs to track it. `projectType` + a one-shot "generate N units" action
is the only new state needed.

## 2. New enum: `ProjectType`

Follows the exact existing string-enum pattern (`Role`, `Trade`,
`ProjectStage` in `backend/src/constants.ts`; no native Prisma enum on
SQLite).

`backend/src/constants.ts` — be-developer adds:

```ts
export const ProjectType = {
  RESIDENTIAL_BUILDING: "RESIDENTIAL_BUILDING",
  PRIVATE_HOUSES: "PRIVATE_HOUSES",
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];
```

Also add a line to the enum-vocabulary comment block at the top of
`schema.prisma`'s neighboring doc comment (already done in this pass) — no
further backend action needed there.

`frontend/src/api/types.ts` — fe-developer adds:

```ts
export type ProjectType = "RESIDENTIAL_BUILDING" | "PRIVATE_HOUSES";
```

and on `Project`: `projectType: ProjectType | null;`

`frontend/src/constants/labels.ts` — fe-developer adds, following the exact
`tradeLabel()`/`projectStageLabel()` pattern:

```ts
export const projectTypeLabels: Record<ProjectType, string> = {
  RESIDENTIAL_BUILDING: "בניין מגורים",
  PRIVATE_HOUSES: "בתים פרטיים",
};
export const projectTypes = Object.keys(projectTypeLabels) as ProjectType[];
export function projectTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return projectTypeLabels[type as ProjectType] ?? type;
}
```

Also add the Hebrew unit-name prefix mapping used to build default
identifiers (this is presentation text, so per project convention it lives
in frontend, not backend — the backend enum stays English-only and never
sees these Hebrew strings):

```ts
export const unitNamePrefixByProjectType: Record<ProjectType, string> = {
  RESIDENTIAL_BUILDING: "דירה",
  PRIVATE_HOUSES: "בית",
};
```

fe-developer decides the exact helper name/shape for turning a prefix +
index range into `identifiers: string[]` (e.g. `"דירה 1"` … `"דירה 5"`) — the
only hard requirement is the numbering rule in section 6.

## 3. Nullability / retrofit behavior

- `projectType` is nullable, defaults to `null`. Every existing project in
  `dev.db` will read back `projectType: null` after migration — no backfill.
- UI rule: while `projectType` is `null`, the project behaves exactly as it
  does today — free-text `identifier` entry via the existing "add unit" form
  (`POST /units`), no generate-N-units flow offered. This is the existing
  `AddUnitForm` in `frontend/src/components/ProjectTree.tsx` — fe-developer
  should leave it as the fallback path, not remove it.
- Once an entrepreneur sets `projectType` (at creation or later via
  `PATCH /projects/:id`), the UI additionally offers the "generate N units"
  action described in section 5. The free-text single-unit form stays
  available too — `identifier` remains editable free text per the product
  decision, so nothing about `POST /units` / `PATCH /units/:id` changes or
  gets restricted.

## 4. API contract — `Project` create/update

`backend/src/routes/projects.ts`

- `POST /projects`: request body gains optional `projectType?: string`.
  Validate the same way `currentStage` is validated today (line ~120):
  `if (projectType && !validProjectTypes.includes(projectType)) return 400`.
  Persist as `projectType: projectType ?? null`.
- `PATCH /projects/:id`: request body gains optional `projectType?: string`,
  same validation, passed through to the `prisma.project.update` data object
  (mirror how `currentStage` is threaded through both routes today).
- Response shape: `Project` JSON gains `projectType: string | null` — no
  other response shape changes on these two routes.
- No restriction on changing `projectType` after units already exist — see
  edge case decision in section 6.

## 5. API contract — bulk unit generation

`backend/src/routes/units.ts` — new route, same file, same auth pattern as
the existing `POST /units` (router already does
`requireAuth, requireRole(SUPER_ADMIN, ENTREPRENEUR)`, then per-request
`assertProjectOwnership`):

```
POST /units/bulk
Body: { projectId: number, identifiers: string[] }
```

- `projectId` required, must resolve to a project the actor owns (identical
  ownership check to existing `POST /units`: 404 if project not found, 403
  via `assertProjectOwnership` if not owned).
- `identifiers`: required array, `1..100` entries (sanity cap, same spirit
  as the existing `participants` max-7 cap in `projects.ts`), each a
  non-empty string after `.trim()`. 400 with a message listing the
  violation, matching the existing error-message style in this codebase
  (e.g. `"identifiers must be an array of 1 to 100 non-empty strings"`).
- The route does **not** compute the Hebrew names itself and does **not**
  need to know `projectType` — the frontend already has the project's
  current `units.length` and the project's `projectType` in hand (both are
  already in the `Project` object it's operating on) and sends the exact
  strings to create. This keeps Hebrew text out of the backend entirely,
  consistent with how every other Hebrew label in this app lives only in
  `frontend/src/constants/labels.ts`.
- Implementation: create all rows in one `prisma.$transaction` of
  individual `prisma.unit.create()` calls (not `createMany`, so the route
  can return the created rows — same reasoning as the existing
  `$transaction` usage in `projects.ts`'s `PATCH /:id`).
- Response: `201` with `Unit[]` — same per-unit shape as the existing
  `POST /units` response (`{ id, projectId, identifier, createdAt }`), so
  the frontend can append to its unit list without refetching the project.

No changes to `PATCH /units/:id` (rename) or `DELETE /units/:id` — both
already do exactly what's needed (free-text rename; delete one unit).

## 6. Edge-case decisions (flagged for review — not previously asked to the user)

1. **Numbering when adding more units later.** New units generated by
   `POST /units/bulk` are numbered starting at `(current total unit count on
   the project) + 1`, regardless of what earlier units were renamed to.
   E.g. a project with 3 units (however currently named) that generates 2
   more gets identifiers for indices 4 and 5. Rejected alternative: parsing
   existing identifiers for the highest `"<prefix> N"` found — fragile,
   since identifiers are freely renamed free text and could contain
   anything. Count-based numbering is simple and never needs to inspect
   existing text.

2. **Changing `projectType` after units already exist — allowed, no
   restriction.** This has to be allowed regardless, since it's exactly
   the retrofit case (existing project, existing free-text units, setting
   `projectType` for the first time). Changing it does not touch existing
   `Unit` rows in any way (no rename, no re-tagging) — it only affects the
   prefix used by future `POST /units/bulk` calls. If product wants a
   confirmation dialog ("this won't rename your existing units") that's a
   frontend-only UX decision, not a contract change.

3. **Can unit count decrease?** Yes, via the existing `DELETE /units/:id` —
   unchanged by this feature. No bulk-delete endpoint is added; out of scope
   for this feature (add on request, not preemptively).

4. **Sanity cap of 100 on bulk-generate.** Arbitrary but deliberate — mirrors
   the existing `participants` max-7 validation pattern in `projects.ts`.
   Flag to product if 100 is wrong for real project sizes; trivial to change.

## 7. Files touched / to touch

Done in this pass (team-lead):
- `backend/prisma/schema.prisma` — added `Project.projectType`
- `backend/prisma/migrations/20260901120000_add_project_type/migration.sql`
- this spec: `docs/specs/project-type-and-units.md`

Not yet applied: `npx prisma migrate dev` against `dev.db` — do this
deliberately, not as part of routine dev work, per repo convention.

For be-developer (backend/src/constants.ts, backend/src/routes/projects.ts,
backend/src/routes/units.ts, plus a new Vitest file under backend/tests/ per
repo convention) and fe-developer (frontend/src/api/types.ts,
frontend/src/constants/labels.ts, frontend/src/components/ProjectTree.tsx
and wherever project creation lives, plus a new/extended Playwright spec
under frontend/e2e/): implement against sections 2–6 above.
