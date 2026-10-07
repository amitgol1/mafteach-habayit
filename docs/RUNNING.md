# Running locally

## Prerequisites

- Node.js 20+

## 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 2. Configure environment

`backend/.env` already exists (copied from `.env.example`) with local defaults:

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-local-env"
PORT=4000
UPLOADS_DIR="../uploads"
```

## 3. Set up the database

```bash
cd backend
npx prisma migrate deploy   # apply migrations, creates prisma/dev.db
npm run seed                # creates the initial admin user
```

Seeded admin login:

- Email: `admin@mafteach-habayit.local`
- Password: `admin123`

## 4. Run the servers

In two terminals:

```bash
cd backend && npm run dev     # http://localhost:4000
cd frontend && npm run dev    # http://localhost:5173
```

The frontend dev server proxies `/api` and `/uploads` to `http://localhost:4000` (see `frontend/vite.config.ts`), so open **http://localhost:5173** and log in with the seeded admin credentials above.

## Notes

- Uploaded files (feed media, financial receipts) are stored in `/uploads` at the repo root and served statically by the backend at `/uploads/...`.
- SQLite has no native enum support in Prisma; status/role/mediaType values are plain strings — see `backend/src/constants.ts` for the allowed values.
- To reset the database: delete `backend/prisma/dev.db`, then re-run step 3.

# Production (Cloudflare)

The live app runs on Cloudflare Workers (free plan) at
https://mafteach-habayit-api.mafteach-habayit-backend.workers.dev — this is the primary copy of the data.
Local `dev.db` is for development only and is not synced with it.

| Piece | Cloudflare resource |
|---|---|
| API (`backend/src/worker.ts`) + built frontend | Worker `mafteach-habayit-api` |
| Database | D1 `mafteach-habayit-db` |
| Uploaded files | KV namespace `UPLOADS_KV` (chunked, see `backend/src/utils-worker/upload.ts`) |
| `JWT_SECRET`, `TOTP_ENCRYPTION_KEY` | Worker secrets |

Any backend change must go into the Worker routes (`backend/src/routes-worker/`), not only the Express ones.

## Environments

| | Production | Dev (QA) |
|---|---|---|
| URL | https://mafteach-habayit-api.mafteach-habayit-backend.workers.dev | https://mafteach-habayit-api-dev.mafteach-habayit-backend.workers.dev |
| Worker | `mafteach-habayit-api` | `mafteach-habayit-api-dev` |
| D1 | `mafteach-habayit-db` | `mafteach-habayit-db-dev` |
| wrangler flag | none | `--env dev` |

Dev uses the same `TOTP_ENCRYPTION_KEY` as production (so copied 2FA setups work) and its own `JWT_SECRET`.

## Release

Requires `npx wrangler login` once. After a schema change in `backend/src/db/schema.ts`, run `npx drizzle-kit generate` first; the deploy scripts apply pending migrations.

```bash
cd backend
npm run copy:prod-to-dev   # dev data := copy of production
npm run deploy:dev         # build frontend, migrate dev D1, deploy to dev
cd ../frontend && npx playwright test -c playwright.live.config.ts   # QA on dev
cd ../backend && npm run deploy:prod   # only after QA approval
```

## Test against the Worker

Runs the full Playwright suite against a local `wrangler dev` (isolated D1/KV, port 4001):

```bash
cd frontend && npx playwright test -c playwright.worker.config.ts
```
