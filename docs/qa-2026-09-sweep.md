# QA sweep — entrepreneur/project/collaborator create-edit-delete — 2026-09-24

Triggered by a full manual QA pass request ("create an entrepreneur and project with
all fields, edit both, create and edit a professional/trade user, delete everything") after the
Playwright suite (39 specs) passed clean. Two concrete functionality gaps were found by
reading the code directly, not by running new tests first. Both are confirmed below,
with one correction to how the first gap was originally described.

## 1. Delete project — no frontend UI

`DELETE /projects/:id` (`backend/src/routes/projects.ts:243-260`) is fully implemented:
role-gated to `SUPER_ADMIN`/`ENTREPRENEUR`, ownership-checked via `assertProjectOwnership`,
reachable by API. **Correction to the originating brief:** the route does *not* run a manual
`projectParticipant.deleteMany` step — it does a single `prisma.project.delete({ where: { id } })`.
That's sufficient because every dependent model (`Unit`, `ProjectParticipant`, `Update` via
`projectId`) has `onDelete: Cascade` on its FK to `Project` in `backend/prisma/schema.prisma`,
and `Phase`/`SubPhase`/`PhaseAssignment`/`FinancialRecord` cascade transitively from there. The
delete is a clean, complete cascade at the DB level — no backend change needed for this gap.

Nothing in `frontend/src/` calls this endpoint. Only user deletion
(`frontend/src/components/UserList.tsx:41`) and unit deletion
(`frontend/src/components/ProjectTree.tsx:182`) exist as delete actions today.

### Fix contract (for fe-developer)

- **Where:** `frontend/src/pages/ProjectPage.tsx`, in the header row next to the existing
  "ערוך פרויקט" button, gated the same way (`isManager`).
- **Confirmation UX:** `window.confirm`, matching the only pattern this codebase uses for
  destructive actions (`UserList.tsx:38`, `ProjectTree.tsx:174-180`) — no modal/dialog
  component exists here, don't introduce one for this alone. Message, following the unit-delete
  wording convention:
  `` `למחוק את הפרויקט "${project.name}"? פעולה זו תמחק גם את כל היחידות, השלבים, תת-השלבים, העדכונים והנתונים הפיננסיים שלו. לא ניתן לבטל.` ``
  (explicit about cascade scope — this is a materially bigger blast radius than deleting one unit).
- **On success:** navigate to `/` (dashboard) via `useNavigate` — established pattern
  (`Layout.tsx`, `Login.tsx`) — since the project page has nothing left to show.
- **On error:** stay on the page, show the message inline near the button using the same
  `apiErrorMessage`-style extraction already used in `ProjectTree.tsx`/`UserList.tsx`
  (`err.response?.data?.error ?? fallback`).
- **API contract:** no changes. `DELETE /projects/:id` → `204` on success, `403`/`404` as today.
- **Test:** new Playwright spec (or extend `frontend/e2e/project-edit.spec.ts`) covering:
  create project → delete via UI → confirm dialog → redirected to dashboard → project gone
  from list → (as SUPER_ADMIN and as ENTREPRENEUR, since both roles can delete).

## 2. Delete entrepreneur who owns projects — reproduced live

**Confirmed by reproduction**, not just static reading — ran against the isolated e2e harness
(`npm run test:e2e:serve`, port 4001, `prisma/e2e.db`; never touched `dev.db` or the live
4000/5173 servers; `e2e.db` deleted and the server process killed afterward).

Repro: SUPER_ADMIN creates an entrepreneur, creates a project owned by that entrepreneur, then
`DELETE /users/:entrepreneurId`. Result:

```
HTTP/1.1 500 Internal Server Error
{"error":"\nInvalid `prisma.user.delete()` invocation in\n/Users/.../backend/src/routes/users.ts:185:23\n\n  182   res.status(403)...\n  183   return;\n  184 }\n→ 185 await prisma.user.delete(\nForeign key constraint violated: `foreign key`"}
```
Server log: `PrismaClientKnownRequestError ... code: 'P2003'`.

Root cause confirmed: `Project.entrepreneurId` has `onDelete: Restrict` at the actual SQLite
FK level (`backend/prisma/migrations/20260816145853_make_entrepreneur_id_required/migration.sql:20`:
`FOREIGN KEY ("entrepreneurId") REFERENCES "User" ("id") ON DELETE RESTRICT`). `DELETE
/users/:id` (`backend/src/routes/users.ts:172-188`) has no try/catch around `prisma.user.delete`,
and `backend/src/app.ts`'s global error handler (`app.ts:32-47`) has no Prisma-specific
translation — for any error that isn't `UnsupportedFileTypeError`/`MulterError`, it falls
through to `res.status(500).json({ error: err.message })`, which for a
`PrismaClientKnownRequestError` leaks the raw query, an internal file path, and the Prisma
error string verbatim to the client. Not just "ungraceful" — an information-disclosure bug in
its own right (internal filesystem paths in a client-facing JSON error).

### Business-rule decision: block, don't cascade

**Decision: block deletion of an entrepreneur who still owns projects, with a clear Hebrew
error. Do not cascade-delete their projects.**

Why:
1. The schema already encodes this intent — `onDelete: Restrict` on `Project.entrepreneurId`
   was a deliberate choice (unlike the `Cascade` used everywhere else a child belongs to its
   parent's own subtree, e.g. `Unit`→`Project`, `Phase`→`Unit`). The bug here is that the
   Restrict fires ungracefully, not that Restrict is wrong — the fix should surface that
   existing rule cleanly, not silently override it into a cascade.
2. Blast radius mismatch: deleting a *user account* cascading into deletion of an entire
   *project's* history (units, phases, sub-phases, updates, financial records/receipts) is a
   dangerous, surprising side effect for a construction-tracking app where that data has
   standalone real-world value (payment records, photos) independent of who happens to own the
   login.
3. UX precedent mismatch: every existing destructive action in this app (`UserList.tsx`,
   `ProjectTree.tsx`) uses a single plain `window.confirm`. Cascading a user-delete into
   project-deletion would need a much stronger confirmation UX (e.g. "type the entrepreneur's
   name to confirm you're also deleting N projects") that doesn't exist anywhere in this
   codebase yet — introducing it for this one case is disproportionate scope for an MVP.
4. Blocking is trivially reversible in the workflow sense: the admin/entrepreneur can delete
   the projects first (that UI now exists per gap #1) and then delete the entrepreneur — no
   functionality is lost, just an explicit two-step instead of an implicit destructive cascade.

### Fix contract (for be-developer)

`backend/src/routes/users.ts`, `DELETE /:id` handler:

1. After the existing `assertUserOwnership` check, if `target.role === Role.ENTREPRENEUR`,
   proactively check `prisma.project.count({ where: { entrepreneurId: id } })`. If `> 0`, return
   `409` with `{ error: "יש למחוק את הפרויקטים של היזם לפני מחיקתו" }`. (`409 Conflict` —
   matches REST semantics for "can't delete, conflicts with existing dependent state"; distinct
   from this route's existing `400`/`403`/`404` uses.)
2. Wrap the `prisma.user.delete(...)` call itself in a try/catch as defense-in-depth against the
   race window between the count check and the delete (a project could theoretically be created
   in between): catch `PrismaClientKnownRequestError` with `code === "P2003"` and return the same
   `409` + message, instead of letting it fall to the generic error handler. Do **not** make this
   the only guard — the proactive count check is the primary path so the common case never
   touches Prisma's raw error shape at all.
3. No change needed to the global error handler in `app.ts` for this specific case now that the
   route handles it explicitly — but flagging separately: the fact that *any* unhandled Prisma
   error currently leaks `err.message` (including file paths) to API clients is a broader
   hardening gap beyond this one route. Not fixing generically in this pass (scope: this QA
   sweep's two concrete findings) — flagging for a future pass if the team wants a blanket
   Prisma-error translator in `app.ts`.
4. **No frontend change needed.** `UserList.tsx:41-47`'s `handleDelete` already extracts
   `err.response?.data?.error` and displays it inline — once the backend returns a clean `409`
   message instead of a raw `500`, the existing UI surfaces it correctly with zero FE code
   changes.
5. **Test:** new Vitest case in `backend/tests/` — SUPER_ADMIN creates entrepreneur + project,
   attempts `DELETE /users/:entrepreneurId`, expects `409` + the Hebrew message, and expects the
   entrepreneur to still exist afterward. Extend `frontend/e2e/admin-user-management.spec.ts` (or
   a new spec) for the UI path: create entrepreneur + project, attempt delete via UI, expect the
   confirm-then-inline-error flow, entrepreneur still present in the tree.

## 3. Field-completeness audit

Read directly from `backend/prisma/schema.prisma`, `backend/src/constants.ts`, the frontend
forms, and every relevant `frontend/e2e/*.spec.ts`. "Covered" below means: an e2e spec sets the
field on create *and* edits it *and* asserts the new value survives a page reload — the
`project-edit.spec.ts` pattern. Anything weaker (set-on-create-only, or edited but never
reload-verified) is called out explicitly, not counted as covered.

### Project (`ProjectFormFields.tsx`, backend `POST`/`PATCH /projects`)

| Field | Create coverage | Edit + reload-persist coverage | Gap |
|---|---|---|---|
| `name` | Yes (`admin-project-creation.spec.ts`, `project-type-and-units.spec.ts`) | **No spec ever edits `name`** | Gap |
| `location` | Yes | **No spec ever edits `location`** | Gap |
| `owners` | Yes (`admin-project-creation.spec.ts`) | **No spec ever edits `owners`** | Gap |
| `totalBudget` | Yes | Yes (`project-edit.spec.ts`) | none |
| `currentStage` | Yes | Yes (`project-edit.spec.ts`) | none |
| `projectType` | Yes, but only in `project-type-and-units.spec.ts` — **`admin-project-creation.spec.ts` genuinely never sets it**, confirming the originating suspicion. Also never reload-verified as a field value (only inferred indirectly via generated unit-name prefixes). | **No spec ever edits `projectType` after creation** | Gap (create partially covered, edit not at all) |
| `entrepreneurId` | Yes for the SUPER_ADMIN-picks-entrepreneur path (`admin-project-creation.spec.ts`); the ENTREPRENEUR self-create path (no picker) is covered too (`entrepreneur-scope.spec.ts:51-52`), minimally (name/location only) | N/A by design — not in `ProjectFormPayload` for edit, ownership doesn't change via edit form | Not a gap — intentional restriction |
| `participants` (up to 7, one per trade) | Only 1 of 7 trades (`ARCHITECT`) ever set in a project-creation flow | **No spec edits participants via the project edit form at all** (`alwaysIncludeParticipants` path in `ProjectEditForm.tsx` is unexercised) | Gap |
| `overallStatus` | N/A — derived/read-only, not a form field | — | not applicable |

### User — entrepreneur (`UserManagementForm.tsx`, `UserEditRow` in `UserList.tsx`)

| Field | Create coverage | Edit + reload-persist coverage | Gap |
|---|---|---|---|
| `name` | Yes (`admin-user-management.spec.ts`) | **No spec ever edits an entrepreneur's name** (only a collaborator's name is edited) | Gap |
| `email` | Yes | Not editable anywhere — no email field in `UserEditRow`, `PATCH /users/:id` doesn't accept it | Ambiguous, not a code bug — see below |
| `password` | Yes (set on create) | No edit/reset-password flow exists anywhere (UI or API) — only `reset-totp` exists, which resets 2FA, not the password | Ambiguous, not a code bug — see below |
| `role` | Fixed/derived from actor role, not user-selectable, by design | Same | not applicable |
| `trade` | N/A — always null for entrepreneurs, correctly hidden (`showTrade`/`isCollaborator` gates) | N/A | not applicable |
| `totpSecret`/`totpConfirmedAt` | Managed via the dedicated TOTP setup/confirm flow, covered in `totp-2fa.spec.ts` | Reset-TOTP action (`reset-totp` endpoint) is **only ever exercised for a collaborator** in `totp-2fa.spec.ts:81-109`, never for an entrepreneur | Minor gap |

### User — collaborator/trade-professional

| Field | Create coverage | Edit + reload-persist coverage | Gap |
|---|---|---|---|
| `name` | Yes (`admin-user-management.spec.ts`, `admin-project-creation.spec.ts` beforeAll) | Yes (`admin-user-management.spec.ts`: "edits an existing user's name/trade" — edits and reload-verifies) | none |
| `email` | Yes | Not editable (same as entrepreneur) | Ambiguous — see below |
| `password` | Yes | No edit/reset flow (same as entrepreneur) | Ambiguous — see below |
| `role` | Fixed to `COLLABORATOR` when created by an entrepreneur, by design | Same | not applicable |
| `trade` | Yes | Yes (`admin-user-management.spec.ts`, reload-verified) | none |

### Flagged ambiguity — not decided here, needs the user's call

The original QA request said "edit both" and implied testing **all fields**. Two `User` fields —
`email` and `password` — have **no edit path in the product at all**, not just missing test
coverage: `UserEditRow` never renders an email input, and `PATCH /users/:id`
(`backend/src/routes/users.ts:119-148`) only ever reads `name`/`role`/`trade` from the body. This
may be intentional (email as a stable login identifier; password changes deferred to a future
"forgot password" flow) — but since the user explicitly flagged "not everything worked
properly," it's worth confirming: **is editable email/password in scope for this MVP, or
confirmed out of scope?** Not guessing either way — this is a product decision, not an
engineering one.

### Minor doc-drift note (not a functional bug)

`backend/prisma/schema.prisma`'s top comment block documenting the `ProjectStage` string
vocabulary (lines 17-18) lists only the original 7 values
(`SKELETON`/`ELECTRICITY`/`PLUMBING`/`PLASTER`/`FLOORING`/`ALUMINUM`/`FENCES`) — stale against
`backend/src/constants.ts`'s actual 10 (also has `GARDEN_DEVELOPMENT`, `FENCE_DEVELOPMENT`,
`FINISHES`, `FORM_4`, and no `ALUMINUM`). Cosmetic — the comment isn't load-bearing anywhere,
but worth a one-line fix next time that file is touched.

## Summary of contracts fixed in this pass

| Item | Decision |
|---|---|
| Delete-project UI | Add to `ProjectPage.tsx` header, `window.confirm`, no API contract change |
| Delete-entrepreneur-with-projects | Block with `409` + Hebrew error; do not cascade |
| `email`/`password` edit scope | Not decided — flagged to the user |

## Files referenced

- `backend/prisma/schema.prisma`
- `backend/src/routes/projects.ts`
- `backend/src/routes/users.ts`
- `backend/src/app.ts`
- `backend/src/constants.ts`
- `backend/prisma/migrations/20260816145853_make_entrepreneur_id_required/migration.sql`
- `frontend/src/pages/ProjectPage.tsx`
- `frontend/src/components/ProjectTree.tsx`
- `frontend/src/components/UserList.tsx`
- `frontend/src/components/ProjectFormFields.tsx`
- `frontend/src/components/ProjectCreationForm.tsx`
- `frontend/src/components/ProjectEditForm.tsx`
- `frontend/src/components/UserManagementForm.tsx`
- `frontend/src/constants/labels.ts`
- `frontend/e2e/admin-project-creation.spec.ts`
- `frontend/e2e/project-edit.spec.ts`
- `frontend/e2e/project-type-and-units.spec.ts`
- `frontend/e2e/admin-user-management.spec.ts`
- `frontend/e2e/admin-user-tree.spec.ts`
- `frontend/e2e/totp-2fa.spec.ts`
- `frontend/e2e/entrepreneur-scope.spec.ts`
