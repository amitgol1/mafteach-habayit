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
