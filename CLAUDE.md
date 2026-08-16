# mafteach-habayit — project instructions

Local-first web app for managing private home construction projects (Israel). Backend: Node.js + Express + TypeScript + Prisma/SQLite, in `/backend`. Frontend: React + TypeScript + Vite + Tailwind v4, in `/frontend`. Whole app is Hebrew + RTL (`<html dir="rtl" lang="he">`) — only DB/API/enum values stay in English. See `docs/RUNNING.md` for local setup.

## Agent team workflow

Custom agents live in `.claude/agents/`: `product-manager`, `team-lead`, `be-developer`, `fe-developer`. Use this sequence for non-trivial work (schema changes, new features, cross-cutting fixes):

1. **team-lead first** for anything touching the DB schema, the API contract between FE/BE, or a business-rule ambiguity (e.g. "should this field be nullable", "who can see what"). It owns `schema.prisma` and writes/applies migrations. Don't let be-developer or fe-developer guess at a contract team-lead should be deciding.
2. **be-developer and fe-developer** implement against that contract — dispatch in parallel once the contract is fixed and documented (their work rarely conflicts file-wise). Give each agent full context: exact contract shapes, file paths already touched, and any decisions already made — they start with zero conversation history.
3. **team-lead reviews** FE/BE consistency after both land, when the change is large enough that drift between them is a real risk (new endpoints + new UI touching them in the same round).
4. Small, unambiguous fixes (a missing `include`, a one-line validation gap) — just make them directly, no agent round-trip needed.

## Non-negotiable: test isolation

This app holds real user data in `backend/prisma/dev.db`, actively used through live dev servers on ports 4000/5173. Any test run — automated (Vitest/Playwright) or manual (curl smoke-testing) — MUST NOT touch that database or those servers.

- Backend tests (`backend/tests/`, run via `npm test`) use a separate `test.db` via `backend/.env.test`, guarded in `backend/tests/globalSetup.ts`/`setup.ts` so a test run can never resolve to the real `DATABASE_URL`.
- Frontend E2E (`frontend/e2e/`, run via `npx playwright test`) spins up an isolated backend (port 4001, `e2e.db`) and frontend (port 5174) per `frontend/playwright.config.ts`, torn down after.
- When manually smoke-testing via curl against the live proxy (`localhost:5173`/`4000`) because that's what's running: use throwaway data and delete it afterward. If you touch a real record (e.g. testing an edit endpoint on the user's actual project), restore its original value when done — don't leave test pollution in their real data.
- Before and after any test run or manual verification pass, it's worth confirming `dev.db`'s mtime is unchanged and the live servers still respond — cheap insurance against a mistake.

When adding a feature or fixing a bug, extend the test suites (new Vitest file under `backend/tests/`, new Playwright spec under `frontend/e2e/`) as part of the same change, following the existing patterns in those directories — don't leave new behavior uncovered.

## Git

- Never commit or push without the user explicitly asking, every time — a prior "yes" doesn't carry forward to the next change.
- Always `git fetch` before pushing.
- The local git identity (`coheamit_merck`) doesn't have push access to this repo's remote (`amitgol1/mafteach-habayit`) — pushing needs a GitHub PAT with `repo` scope from the user. Use it for a single push via a temporary token-embedded remote URL, then restore the clean URL immediately after — never leave a token in `.git/config`, and never write it to a persistent file (memory, dotfiles, etc.).

## Design system

A full visual redesign already exists — don't reinvent it. Palette/type tokens are in `frontend/src/index.css` ("blueprint, brass and limestone": petrol-blue structure, aged-brass accent, limestone/plaster neutrals; Suez One display + IBM Plex Sans Hebrew body, both Hebrew-verified). Enum values (Role, Trade, ProjectStage, PhaseStatus) render only through the Hebrew label helpers in `frontend/src/constants/labels.ts` (`tradeLabel()`, `roleLabel()`, `projectStageLabel()`, `phaseStatusLabels`) — never raw. RTL layout uses logical CSS properties (`ms-`/`me-`/`border-s-` etc.) throughout, not physical `ml-`/`mr-`/`left-`/`right-`.
