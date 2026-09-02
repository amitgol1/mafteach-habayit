# TOTP two-factor authentication — contract spec

Feature: standard RFC 6238 TOTP 2FA (any authenticator app — Google
Authenticator, Authy, 1Password, ...), required for every role
(SUPER_ADMIN, ENTREPRENEUR, COLLABORATOR). On first login after this ships,
a user must link an authenticator app before they can do anything else; from
then on every login needs a 6-digit code. Session behavior also changes:
today's fixed 12h-from-login JWT becomes a 12h-idle-timeout (stays logged in
indefinitely while active).

Confirmed with the user (not up for debate): all roles, no grace period for
existing users, no email/invitation flows, TOTP not OAuth/"Sign in with
Google". See section 7 for what's still a product call.

## 0. Read this diff against the real schema, not this worktree's stale copy

This worktree's `backend/prisma/schema.prisma` was stale (missing the
`Project.projectType` and `FinancialRecord.unitId/subPhaseId` changes from
two prior features) when this pass started. It has been brought current —
copied from the real file at
`/Users/coheamit/mafteach-habayit/backend/prisma/schema.prisma` — with the
`User.totpSecret` / `User.totpConfirmedAt` diff below layered on top. The
two migrations that were missing from this worktree
(`20260901120000_add_project_type`,
`20260902055811_add_financial_record_unit_subphase_links`) were also copied
in verbatim so this worktree's migration history matches the real repo
before the new migration is added — same convention as the previous two
specs. **Only the new migration
(`20260902100000_add_user_totp_fields`) and the `User` model diff are this
pass's actual change**; the rest is baseline reconstruction, not new work.

The new migration was **hand-written**, not generated via a live
`prisma migrate dev` run — this worktree has no `node_modules` installed, so
`prisma` isn't runnable here. The SQL is deterministic and low-risk to
hand-write: two nullable columns with no FK/relation on `User` are exactly
the shape SQLite migrations Prisma already generates as a plain
`ALTER TABLE ... ADD COLUMN` (confirmed by the `add_project_type` precedent,
the same shape — one nullable non-FK column, no `RedefineTable`). Verify
this by running `npx prisma migrate diff` or `prisma migrate dev
--create-only` for real once `npm install` has run, before applying.

## 1. Schema change

`backend/prisma/schema.prisma` — two nullable fields added to `User`:

```prisma
model User {
  id              Int       @id @default(autoincrement())
  name            String
  email           String    @unique
  passwordHash    String
  role            String
  trade           String?
  totpSecret      String? // base32 TOTP secret, AES-256-GCM encrypted at rest (iv:authTag:ciphertext, hex) with TOTP_ENCRYPTION_KEY — see section 2; null = setup never started; non-null + totpConfirmedAt null = setup started but abandoned
  totpConfirmedAt DateTime? // set once POST /auth/totp/confirm succeeds; THIS (not totpSecret) is the "2FA fully configured" signal used to route login — see section 4
  createdAt       DateTime  @default(now())
  createdById     Int?
  // ... unchanged relations
}
```

Migration:
`backend/prisma/migrations/20260902100000_add_user_totp_fields/migration.sql`

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpConfirmedAt" DATETIME;
```

Purely additive: two nullable columns, no FK, no data migration, no existing
row loses or changes data. Every existing row reads back both fields as
`null`. **Not applied to any database** — same convention as the prior two
specs: run `npx prisma migrate dev` deliberately when ready, not as part of
this design pass.

### Why two fields, not one

The task suggested a single `totpSecret` field could be the whole signal.
Rejected in favor of two fields: `POST /auth/totp/setup` (section 3) writes
`totpSecret` as soon as a user starts setup, before they've proven they can
generate a valid code from it (e.g. they load the QR code but close the tab
before entering the first code). If `totpSecret` alone gated "needs setup"
vs. "needs code", that abandoned user would be wrongly routed to "enter your
6-digit code" on their next login attempt — for a secret they never
successfully loaded into an authenticator app, permanently locking them out
with no way back to the QR screen. `totpConfirmedAt` is the actual
"2FA is live" signal; `totpSecret` alone only means "a setup attempt exists,
maybe abandoned." Login routing (section 4) uses `totpConfirmedAt`.

### Encrypting `totpSecret` at rest — decision: yes, encrypt

SQLite has no native encryption and this is a local, single-file DB —
`passwordHash`, financial amounts, names, and every other field already sit
in `dev.db` as plaintext (bcrypt hashes aren't "encrypted", they're
one-way). Considered leaving `totpSecret` plaintext to match that existing
posture, but rejected: a leaked `passwordHash` is not directly usable and a
leaked password can be rotated independently by the user; a leaked
`totpSecret` grants an attacker the ability to generate valid 2FA codes
**indefinitely**, with no user-visible signal that anything is wrong, until
someone manually resets it (no reset flow exists in this pass — see section
7). That asymmetry (permanent, silent compromise of the *entire point* of
this feature) justifies protecting this one field specifically, even though
nothing else in the schema is encrypted.

Decision: AES-256-GCM via Node's built-in `crypto` module (no new
dependency), key from a new env var `TOTP_ENCRYPTION_KEY` (64 hex chars /
32 bytes), stored as `iv:authTag:ciphertext` (hex, colon-separated) in the
`totpSecret` column. This is a narrow, cheap addition — it does **not**
defend against "attacker has full access to the running server" (the key
lives in the same `backend/.env` as `JWT_SECRET`, same machine, same trust
boundary), but it does defend against the realistic local-first leak vector
this app already has some exposure to: the `dev.db` *file* getting copied,
backed up, or shared on its own (e.g. sent for debugging, accidentally
included in a zip) without the accompanying `.env`. `be-developer` adds:

- `backend/src/utils/totpCrypto.ts` (or similar) — `encryptSecret(plain):
  string` / `decryptSecret(ciphertext): string` helpers.
- `TOTP_ENCRYPTION_KEY` to `backend/.env.example`, `backend/.env`,
  `backend/.env.test`, and the `test:e2e:serve` npm script's inline env vars
  (same place `JWT_SECRET`/`UPLOADS_DIR` are already set for e2e). Generate
  a real random 32-byte hex value for `.env` (not committed — same as today,
  `.env` isn't in git); `.env.test` can commit a fixed dummy value (mirrors
  how `JWT_SECRET="test-jwt-secret"` is already a committed dummy in
  `.env.test`).

## 2. New dependencies

`backend/package.json`:
- `dependencies`: `otplib` (TOTP secret generation, `keyuri` for the
  `otpauth://` URL, and code verification), `qrcode` (renders the
  `otpauth://` URL to a PNG data URL server-side, so the frontend needs no
  QR-rendering library — just `<img src={qrCodeDataUrl}>`).
- `devDependencies`: `@types/qrcode` (`qrcode` ships no types itself;
  `otplib` ships its own, no `@types/otplib` needed).

`frontend/package.json`:
- `devDependencies` only: `otplib`, used exclusively by
  `frontend/e2e/*.ts` test helpers to compute real 6-digit codes from a
  known secret (section 6). **Must never be imported from `frontend/src/`**
  — production UI never computes a code itself, a human types one from
  their real authenticator app. Flag this in code review if it shows up
  outside `frontend/e2e/`.

## 3. Login flow redesign

Today `POST /auth/login` returns `{ token, user }` immediately on valid
credentials — a full session token. That must stop: a token from this
endpoint must never grant full API access on its own once 2FA is required.

### Two token "kinds", not two secrets

Both token kinds are signed with the existing single `JWT_SECRET` — no new
secret needed. They're distinguished by a `kind` claim, and `requireAuth`
is changed to check it:

- **Session token** (full API access): `{ id, role, kind: "session" }`,
  `expiresIn` handled via sliding reissue (section 5) — no longer a flat
  `"12h"` sign-time constant.
- **Pending token** (post-password, pre-TOTP): `{ id, kind: "totp_pending"
  }` — **no `role` claim at all**. `expiresIn: "10m"`.

`backend/src/middleware/auth.ts`:

```ts
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // ... same header parsing as today ...
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  if (payload.kind !== "session") {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = { id: payload.id, role: payload.role };
  // ... sliding reissue, section 5 ...
  next();
}

export function requirePendingAuth(req: PendingAuthedRequest, res: Response, next: NextFunction) {
  // same header parsing
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  if (payload.kind !== "totp_pending") {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.pendingUserId = payload.id;
  next();
}
```

This is the precise answer to "someone must not be able to skip the TOTP
step by holding onto whatever `POST /auth/login` returns": today's
`requireAuth` does an unchecked `as { id: number; role: string }` cast on
whatever the token decodes to — it never validates the payload shape. A
pending token has no `role` claim, so today's code would set
`req.user = { id, role: undefined }`, which happens to fail
`requireRole(...)` checks (undefined matches no role) but would **not**
fail on any route that only calls `requireAuth` with no further role check.
The explicit `kind` check closes that gap regardless of whether a given
route happens to also check role.

### `POST /auth/login` — three response shapes

Request body unchanged: `{ email: string, password: string }`.

1. **Invalid credentials** (unknown email or wrong password) — unchanged:
   `401 { error: "Invalid credentials" }`.
2. **Valid credentials, `totpConfirmedAt` is null** (never finished setup —
   covers both brand-new-to-2FA and abandoned-setup, see section 1):
   ```
   200 { status: "totp_setup_required", pendingToken: string, user: { id, name, email, role, trade } }
   ```
3. **Valid credentials, `totpConfirmedAt` is set**:
   ```
   200 { status: "totp_required", pendingToken: string, user: { id, name, email, role, trade } }
   ```

`user` is included in both 2/3 (not sensitive — same shape login already
returns) so the frontend can show "Hi, {name}" on the setup/code screens
without a second round trip.

### New endpoints — all under the existing `authRouter` (`/api/auth/...`)

**`POST /api/auth/totp/setup`** — requires `requirePendingAuth`.
- If the user's `totpConfirmedAt` is already set → `409
  { error: "TOTP already configured" }`. This is the critical guard:
  without it, anyone who knows a confirmed user's password could call this
  endpoint (password alone is enough to get a pending token) and silently
  re-register a new secret, **bypassing 2FA entirely** without ever proving
  they had the original code. This endpoint may only ever run for a user
  who has not yet confirmed 2FA.
- Otherwise: generate a new secret (`authenticator.generateSecret()`),
  overwrite `totpSecret` (encrypted) — safe to overwrite, since an
  unconfirmed secret was never usable to log in. Build
  `otpauthUrl = authenticator.keyuri(user.email, "mafteach-habayit", secret)`
  and `qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl)`.
- Response: `200 { secret: string, otpauthUrl: string, qrCodeDataUrl: string }`.
  `secret` (raw base32) is returned for a manual-entry fallback if the user
  can't scan a QR code — standard TOTP UX, not a leak: the client
  necessarily needs the raw secret once, to load it into an authenticator
  app; only *at-rest* storage is encrypted.

**`POST /api/auth/totp/confirm`** — requires `requirePendingAuth`. Body:
`{ code: string }`. Finishes setup.
- No `totpSecret` on the user (never called `/setup`) → `400
  { error: "Call /auth/totp/setup first" }`.
- Already confirmed → `409 { error: "TOTP already configured" }` (same
  guard as `/setup`, same reasoning).
- Invalid code → `401 { error: "Invalid code" }`. Pending token is
  untouched/still valid — client may retry until it naturally expires
  (10 min).
- Valid code → set `totpConfirmedAt = now()`, issue a full session token,
  respond `200 { token: string, user: {...} }` — same shape today's
  `POST /auth/login` success response has. User is now logged in; no
  separate second login is needed.

**`POST /api/auth/totp/verify`** — requires `requirePendingAuth`. Body:
`{ code: string }`. The regular login-time code check for a user who
already has `totpConfirmedAt` set.
- Invalid code → `401 { error: "Invalid code" }` (pending token still
  valid, retry until 10-minute expiry).
- Valid code → issue full session token, `200 { token, user }`.

Both `/confirm` and `/verify` decrypt the stored `totpSecret` and call
`authenticator.verify({ token: code, secret })` (otplib default window of
±1 step / ±30s handles minor clock drift).

## 4. Existing-user retrofit

Confirmed: falls out of the schema naturally, using `totpConfirmedAt` (not
`totpSecret` — see section 1's reasoning) as the signal. Every existing row
in `dev.db` has `totpConfirmedAt: null` after migration (no backfill
possible/needed), so every existing user's next login hits case 2 in
section 3 (`totp_setup_required`) — no grace period, no opt-out, matching
the confirmed requirement exactly.

## 5. Idle-timeout mechanism — decision: sliding JWT reissue, no session table

**Chosen: (a) sliding expiration via token reissue on every authenticated
response.** Rejected (b) a server-side session/last-activity table.
Reasoning:

- Scale: this is a single-machine, small-team local app — not a
  high-traffic service where a session table's lookup cost or a stateless
  JWT's revocation gap would matter in practice.
- The app has **no existing revocation feature at all** — "logout" today is
  purely client-side (`AuthContext.logout()` clears `localStorage`, the old
  token stays technically valid until it expires server-side). A session
  table's main advantage over sliding JWT — the ability to invalidate a
  session early — isn't a capability this app has today or that this task
  asked for, so choosing (a) gives up nothing the app currently has.
- (b) is a real architectural shift (new `Session` model, a write on every
  request instead of just a verify, a cleanup/expiry story for stale rows)
  for a benefit (early revocation) nobody asked for. (a) is additive to the
  existing stateless-JWT design: same `JWT_SECRET`, same `jwt.verify`, just
  reissue-with-fresh-expiry instead of trusting the original expiry.
- Cost of (a): re-signing a JWT on every authenticated request is cheap
  (HMAC-SHA256, microseconds) — a non-issue at this app's request volume.

### Mechanism

`requireAuth` (after the existing `kind === "session"` check, section 3),
before calling `next()`:

```ts
const refreshed = jwt.sign({ id: payload.id, role: payload.role, kind: "session" }, process.env.JWT_SECRET!, {
  expiresIn: "12h",
});
res.setHeader("X-Refreshed-Token", refreshed);
```

Reissued unconditionally on every authenticated request (not "only if <11h
remain" or similar) — simplest correct implementation, and the per-request
cost is negligible at this scale, so there's no reason to add that
complexity.

`POST /api/auth/login`, `.../totp/confirm`, `.../totp/verify` all still
issue the *initial* session token with `expiresIn: "12h"` directly in the
response body (unchanged shape); the header mechanism is only for
*ongoing* requests through `requireAuth`.

### Frontend integration point — real work, not free

This is the one part of this design that lands in `fe-developer`'s lap as
new work, not just "consume a new response shape":

- `backend/src/app.ts`: `app.use(cors())` currently has no options.
  Browsers hide custom response headers from JS on cross-origin requests
  unless the server opts in via `Access-Control-Expose-Headers`. Must
  become `app.use(cors({ exposedHeaders: ["X-Refreshed-Token"] }))` or the
  frontend interceptor below will read `undefined` forever. (Same-origin
  requests, e.g. via the Vite dev proxy on 5173, aren't restricted this
  way, but production topology isn't guaranteed to be same-origin — set
  this regardless, it's a zero-risk one-line addition since `cors()` is
  already unrestricted on origin.)
- `frontend/src/api/client.ts` — add a response interceptor that reads
  `response.headers["x-refreshed-token"]` and, if present,
  `localStorage.setItem("token", ...)`. The existing request interceptor
  already re-reads `localStorage.getItem("token")` fresh on every outgoing
  request (not from React state), so this alone is sufficient to keep the
  session alive — the *next* request automatically picks up the refreshed
  token. `AuthContext`'s `token` state does **not** need to be kept in sync
  for this to work (nothing in the app reads auth state from context for
  request purposes today, only from `localStorage` via the axios
  interceptor — confirmed by reading `frontend/src/auth/AuthContext.tsx`
  and `frontend/src/api/client.ts`), so this is a self-contained change to
  one file.

## 6. Test bypass — flagged prominently, needs review before implementation

Two different mechanisms, for two different reasons, at two different
layers. Read both before approving.

### Backend Vitest (`backend/tests/`) — no bypass code needed at all

`backend/tests/helpers.ts` already has `tokenFor(user)`, which **signs a
session JWT directly** with `process.env.JWT_SECRET` (from `.env.test`),
never calling `POST /auth/login` over HTTP at all. Every existing test file
(`financials.test.ts`, `projects.test.ts`, etc.) already gets its
authenticated requests this way — this is the *existing*, already-reviewed
pattern for exactly this problem, not something new. The only change
needed: add `kind: "session"` to the payload `tokenFor` signs, since
`requireAuth` now requires it:

```ts
export function tokenFor(user: { id: number; role: string }) {
  return jwt.sign({ id: user.id, role: user.role, kind: "session" }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}
```

This lives in `backend/tests/`, is never imported by `backend/src/`, and
requires `process.env.JWT_SECRET` to already equal the test secret from
`backend/.env.test` (loaded under the existing `DATABASE_URL` safety check
in `backend/tests/setup.ts`) — there is no code path by which this reaches
`dev.db`. `backend/tests/auth.test.ts` itself (which *does* test
`POST /auth/login` over HTTP) needs rewriting for the new response shapes,
and gets new cases added for `/auth/totp/setup`, `/confirm`, `/verify` —
using `otplib`'s `authenticator.generate(secret)` on the real secret
returned by `/setup`'s response to compute a real, valid code. No
special-cased "test code" exists anywhere in the endpoint logic itself.

### Frontend Playwright e2e (`frontend/e2e/`) — real codes, computed by a real TOTP library, no bypass branch in app code

`frontend/e2e/helpers/api.ts` talks to the isolated e2e backend over plain
HTTP (port 4001, `e2e.db`) — it has no server-side code access to forge a
JWT the way the backend test helper does. It can't fake TOTP either — the
same principle applies: **use `otplib` to compute a real, valid code from a
known secret**, submitted through the real `/auth/totp/confirm` /
`/auth/totp/verify` endpoints exactly as a real authenticator app's output
would be. There is no "if e2e, accept any code" branch anywhere in
`backend/src/`.

Two cases:

1. **Fresh users created mid-test** (e.g. `createEntrepreneur()` in
   `frontend/e2e/helpers/api.ts`, which creates a user via `POST /users`):
   walk the real flow — login → `totp_setup_required` → `POST
   /auth/totp/setup` → `authenticator.generate(secret)` from the response
   → `POST /auth/totp/confirm`. Slightly slower than today's one-call
   `apiLogin`, but it's exercising the real feature, not working around it.
2. **The seeded admin/entrepreneur** (`admin@mafteach-habayit.local`,
   `yakov@y.com` — used across dozens of existing e2e specs via
   `adminToken()`/`ENTREPRENEUR_EMAIL`), used constantly enough that
   forcing every test through the full setup dance would be real overhead.
   For these two accounts only: **`backend/prisma/seed.ts` pre-confirms a
   known, fixed TOTP secret — gated strictly on `DATABASE_URL` matching
   `e2e.db`**, mirroring the exact pattern already in
   `backend/tests/setup.ts` (`DATABASE_URL?.includes("test.db")`):

   ```ts
   // Only for the isolated e2e database — mirrors the DATABASE_URL safety
   // check in backend/tests/setup.ts. Never runs against dev.db: `npm run
   // seed` (local dev, docs/RUNNING.md) uses DATABASE_URL="file:./dev.db",
   // which does not match "e2e.db", so real accounts always fall through
   // to the normal null/null "needs setup" state.
   const E2E_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // committed, well-known — e2e-only, see docs/specs/totp-2fa.md
   if (process.env.DATABASE_URL?.includes("e2e.db")) {
     await prisma.user.update({
       where: { email: "admin@mafteach-habayit.local" },
       data: { totpSecret: encryptSecret(E2E_ADMIN_TOTP_SECRET), totpConfirmedAt: new Date() },
     });
     // same for yakov@y.com
   }
   ```

   `frontend/e2e/helpers/api.ts` imports the same constant (or a small
   shared fixtures file) and computes the login code with
   `authenticator.generate(E2E_ADMIN_TOTP_SECRET)` before calling
   `/auth/totp/verify`, exactly like a real authenticator app would, just
   automated.

   **Why this is the one piece here that needs explicit sign-off**: this is
   the only change in this whole design that touches a script
   (`prisma/seed.ts`) that *also* runs against real `dev.db` (via `npm run
   seed` per `docs/RUNNING.md`). Everything else above (`tokenFor`,
   Playwright's `otplib` usage) lives entirely in test-only files that
   never execute against production data by construction. This one is safe
   *only* if the `DATABASE_URL?.includes("e2e.db")` gate is correct and
   stays correct — same class of guard as `tests/setup.ts`'s existing
   check, same confidence level, but it's new code in a shared file, so it
   deserves a second look before anyone builds against it. Confirmed: real
   `dev.db`'s `DATABASE_URL` is `file:./dev.db` (see `backend/.env`), which
   does not contain `e2e.db` — the gate cannot fire against it.

### Explicitly not built: brute-force protection on code guesses

No attempt-lockout/rate-limiting on `/auth/totp/confirm` or `/verify` is
being added this pass. The only throttle is the pending token's 10-minute
expiry (a fresh `pendingToken` is required after that, meaning a fresh
password re-entry). Flagged in section 7 as an open question, not built
speculatively — this wasn't asked for, and a stateless lockout mechanism
(e.g. an attempt counter baked into the pending JWT) is exactly the kind of
unrequested complexity this task's scope-control guidance says to avoid
adding without being asked.

## 7. Flagged for user/product review — not decided here

1. **Brute-force protection on TOTP code entry.** See section 6 above —
   currently just the 10-minute pending-token expiry. If this app is ever
   reachable beyond the local machine (e.g. remote access for an
   entrepreneur), an attacker with a stolen password gets unlimited code
   guesses per pending token, and can request a fresh pending token
   immediately by re-submitting the (known) password. Flag if this needs a
   lockout/backoff.
2. **Lost-authenticator recovery.** There is no "reset my 2FA" flow in this
   pass (matches "no email/invite flows" scope). Today, a user who loses
   their authenticator app has no self-service path back in — the only fix
   would be a SUPER_ADMIN/ENTREPRENEUR manually clearing `totpSecret` /
   `totpConfirmedAt` directly in the DB (no UI/endpoint for this exists
   either). Is that acceptable for launch, or does this need an
   admin-facing "reset this user's 2FA" endpoint even without email/invite
   flows?
3. **Setup UI flow exact UX.** Whether the QR-code screen and the
   6-digit-code screen are one combined screen or two, what happens if a
   user navigates away mid-setup (they can just log in again — a fresh
   `pendingToken` and a freshly-regenerated secret, since `totpSecret` gets
   overwritten each `/setup` call while unconfirmed — but is that the UX
   product wants, e.g. should the old QR code silently stop working the
   moment a new one is requested?), and whether "invalid code" shows a
   countdown/retry-in-N-seconds hint. Engineering has no opinion here; this
   is `fe-developer`'s to build once product picks a flow.
4. **Does `PATCH /users/:id` need a "force re-setup" action** (e.g. an
   admin suspects a user's device/secret is compromised and wants to force
   them through setup again without knowing their password)? Not built —
   flagging as a possible follow-up, not in scope unless asked.

## 8. Files touched / to touch

Done in this pass (team-lead):
- `backend/prisma/schema.prisma` — `User.totpSecret`, `User.totpConfirmedAt`
- `backend/prisma/migrations/20260902100000_add_user_totp_fields/migration.sql`
- this spec: `docs/specs/totp-2fa.md`

Not yet applied: `npx prisma migrate dev` — run deliberately, not as part
of routine dev work, per repo convention. Also not yet run: `npm install`
for the new `otplib`/`qrcode`/`@types/qrcode` dependencies (backend) and
`otplib` (frontend devDependency).

For be-developer:
- `backend/package.json` — add dependencies (section 2)
- `backend/.env.example`, `.env`, `.env.test`, `test:e2e:serve` script —
  add `TOTP_ENCRYPTION_KEY` (section 1)
- `backend/src/utils/totpCrypto.ts` (new) — encrypt/decrypt helpers
  (section 1)
- `backend/src/middleware/auth.ts` — `kind` check in `requireAuth`, new
  `requirePendingAuth` (section 3)
- `backend/src/routes/auth.ts` — rewrite `POST /login`, add
  `POST /totp/setup`, `/totp/confirm`, `/totp/verify` (section 3), sliding
  reissue in `requireAuth` (section 5)
- `backend/src/app.ts` — `cors({ exposedHeaders: ["X-Refreshed-Token"] })`
  (section 5)
- `backend/tests/helpers.ts` — `tokenFor` gains `kind: "session"` (section 6)
- `backend/tests/auth.test.ts` — rewrite for new login shapes, add
  setup/confirm/verify coverage (section 6)
- `backend/prisma/seed.ts` — `DATABASE_URL`-gated e2e-only TOTP
  pre-confirmation for the seeded admin/entrepreneur (section 6) — **flagged
  for explicit review before building**

For fe-developer:
- `frontend/package.json` — `otplib` devDependency, e2e-only (section 2)
- `frontend/src/api/client.ts` — response interceptor reading
  `X-Refreshed-Token` (section 5)
- `frontend/src/auth/AuthContext.tsx` and login UI — handle the new
  `totp_setup_required`/`totp_required` response shapes, build the QR-code
  screen (`<img src={qrCodeDataUrl}>`) and the 6-digit code entry screen
  (section 3); exact flow per section 7 item 3, pending product input
- `frontend/e2e/helpers/api.ts` — rewrite `apiLogin`/`adminToken`/
  `createEntrepreneur`/`loginViaUi` to walk the real setup/verify flow using
  `otplib` (section 6)
- new/extended Playwright spec(s) under `frontend/e2e/` covering: first-login
  forced setup (QR screen → code → logged in), subsequent login with a code,
  wrong code rejected, and (if in scope after section 7 review) any
  lost-authenticator path
