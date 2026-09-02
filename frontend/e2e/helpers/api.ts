import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { authenticator } from "otplib";

// Talks directly to the isolated e2e backend (port 4001) to set up fixtures
// (users/projects/units/phases/sub-phases) that have no creation UI, or where
// UI-driven setup would be slower/flakier than the test actually needs.
const API_BASE = "http://localhost:4001/api";

export const ADMIN_EMAIL = "admin@mafteach-habayit.local";
export const ADMIN_PASSWORD = "admin123";

// Well-known RFC 6238 TOTP test vector. Committed on purpose: `prisma/seed.ts`
// pre-confirms this exact secret for the seeded admin/entrepreneur accounts,
// gated strictly on DATABASE_URL containing "e2e.db" (never dev.db) — see
// docs/specs/totp-2fa.md section 6.
const E2E_SEEDED_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type LoginResponse =
  | { status: "totp_setup_required"; pendingToken: string }
  | { status: "totp_required"; pendingToken: string };

// Walks the real login -> TOTP flow over HTTP, exactly like a real client
// would (no bypass branch exists in the backend for e2e). Returns the final
// session token plus the secret used, so callers that need to log back in
// later (e.g. via the UI) can compute a fresh code for a returning user.
//
// - Fresh accounts (never completed setup) hit `totp_setup_required`: the
//   `/totp/setup` response itself returns a fresh secret, which we use
//   immediately to compute a real code via otplib and confirm.
// - Already-confirmed accounts hit `totp_required` and need a known secret
//   up front (the seeded accounts' fixed secret, or one captured from an
//   earlier setup call for that same account within the test run).
export async function apiLoginWithTotp(
  email: string,
  password: string,
  knownTotpSecret?: string
): Promise<{ token: string; totpSecret: string }> {
  const loginRes = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.status === "totp_setup_required") {
    const setupRes = await request<{ secret: string }>("/auth/totp/setup", {
      method: "POST",
      headers: authHeaders(loginRes.pendingToken),
      body: JSON.stringify({}),
    });
    const code = authenticator.generate(setupRes.secret);
    const confirmRes = await request<{ token: string }>("/auth/totp/confirm", {
      method: "POST",
      headers: authHeaders(loginRes.pendingToken),
      body: JSON.stringify({ code }),
    });
    return { token: confirmRes.token, totpSecret: setupRes.secret };
  }

  if (!knownTotpSecret) {
    throw new Error(
      `apiLoginWithTotp: ${email} already has TOTP configured (totp_required) but no knownTotpSecret was provided`
    );
  }
  const code = authenticator.generate(knownTotpSecret);
  const verifyRes = await request<{ token: string }>("/auth/totp/verify", {
    method: "POST",
    headers: authHeaders(loginRes.pendingToken),
    body: JSON.stringify({ code }),
  });
  return { token: verifyRes.token, totpSecret: knownTotpSecret };
}

// Plain-token convenience wrapper for the common case (secret not needed by
// the caller). Fresh accounts walk /setup+/confirm automatically; accounts
// that already have TOTP configured must pass `knownTotpSecret` (e.g. the
// seeded accounts' fixed secret) or this throws.
export async function apiLogin(email: string, password: string, knownTotpSecret?: string): Promise<string> {
  const { token } = await apiLoginWithTotp(email, password, knownTotpSecret);
  return token;
}

export async function adminToken(): Promise<string> {
  return apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD, E2E_SEEDED_TOTP_SECRET);
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export type ApiRole = "SUPER_ADMIN" | "ENTREPRENEUR" | "COLLABORATOR";

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: ApiRole;
  trade: string | null;
}

export function apiCreateUser(
  token: string,
  payload: { name: string; email: string; password: string; role: ApiRole; trade?: string }
): Promise<ApiUser> {
  return request("/users", { method: "POST", headers: authHeaders(token), body: JSON.stringify(payload) });
}

// Seeded ENTREPRENEUR (owns any pre-tenancy data backfilled by prisma/seed.ts).
// Prefer `createEntrepreneur()` for test fixtures needing their own quota
// headroom and tenant isolation — this account accumulates state across the
// whole e2e run (shared e2e.db, seeded once for the run) and is only 5
// projects / 20 users away from tripping the quotas other tests rely on.
export const ENTREPRENEUR_EMAIL = "yakov@y.com";
export const ENTREPRENEUR_PASSWORD = "Yakov123!";

// Creates a fresh, throwaway ENTREPRENEUR (via the seeded SUPER_ADMIN, who has
// no creation quota) and returns a ready-to-use token for that entrepreneur.
// Use this for any fixture that creates projects/users, so tests never share
// — and never accidentally trip — another test's 5-project/20-user quota.
//
// Also returns `totpSecret`: this account's TOTP setup is completed as part
// of obtaining the token, so any later UI login for this same account (e.g.
// `loginViaUi`) hits the code-only `totp_required` screen and needs this
// secret to compute a valid code.
export async function createEntrepreneur(): Promise<{
  id: number;
  name: string;
  email: string;
  token: string;
  totpSecret: string;
}> {
  const admin = await adminToken();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `יזם בדיקה ${suffix}`;
  const email = `entrepreneur-${suffix}@e2e.test`;
  const password = "password123";
  const user = await apiCreateUser(admin, { name, email, password, role: "ENTREPRENEUR" });
  const { token, totpSecret } = await apiLoginWithTotp(email, password);
  return { id: user.id, name, email, token, totpSecret };
}

export function apiPatchUser(
  token: string,
  id: number,
  payload: { name?: string; role?: string; trade?: string }
): Promise<ApiUser> {
  return request(`/users/${id}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(payload) });
}

export function apiDeleteUser(token: string, id: number): Promise<void> {
  return request(`/users/${id}`, { method: "DELETE", headers: authHeaders(token) });
}

export function apiResetTotp(token: string, id: number): Promise<void> {
  return request(`/users/${id}/reset-totp`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({}) });
}

export interface ApiProject {
  id: number;
  name: string;
}

export function apiCreateProject(
  token: string,
  payload: {
    name: string;
    location: string;
    owners?: string;
    totalBudget?: number;
    currentStage?: string;
    projectType?: string;
    participants?: { trade: string; userId: number }[];
    entrepreneurId?: number;
  }
): Promise<ApiProject> {
  return request("/projects", { method: "POST", headers: authHeaders(token), body: JSON.stringify(payload) });
}

export interface ApiUnit {
  id: number;
  identifier: string;
}

export function apiCreateUnit(token: string, projectId: number, identifier: string): Promise<ApiUnit> {
  return request("/units", { method: "POST", headers: authHeaders(token), body: JSON.stringify({ projectId, identifier }) });
}

export function apiPatchUnit(token: string, id: number, identifier: string): Promise<ApiUnit> {
  return request(`/units/${id}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ identifier }) });
}

export function apiGetProject(token: string, id: number): Promise<ApiProject & { units: ApiUnit[] }> {
  return request(`/projects/${id}`, { method: "GET", headers: authHeaders(token) });
}

export interface ApiPhase {
  id: number;
}

export function apiCreatePhase(token: string, unitId: number, name: string, order: number): Promise<ApiPhase> {
  return request("/phases", { method: "POST", headers: authHeaders(token), body: JSON.stringify({ unitId, name, order }) });
}

export interface ApiSubPhase {
  id: number;
  name: string;
}

export function apiCreateSubPhase(token: string, phaseId: number, name: string): Promise<ApiSubPhase> {
  return request("/sub-phases", { method: "POST", headers: authHeaders(token), body: JSON.stringify({ phaseId, name }) });
}

export function apiAssignSubPhase(token: string, subPhaseId: number, userId: number): Promise<void> {
  return request(`/sub-phases/${subPhaseId}/assignments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
}

export interface ApiUpdate {
  id: number;
  subject: string | null;
  description: string | null;
  mediaUrl: string | null;
}

// Posts directly to the updates endpoint's multipart form (subject/description
// text fields), bypassing the UI, so tests can seed many updates quickly (e.g.
// for pagination) without the JSON `request` helper above, which can't send
// multipart/form-data.
export async function apiCreateSubPhaseUpdate(
  token: string,
  subPhaseId: number,
  payload: { subject?: string; description?: string }
): Promise<ApiUpdate> {
  const formData = new FormData();
  if (payload.subject) formData.append("subject", payload.subject);
  if (payload.description) formData.append("description", payload.description);
  const res = await fetch(`${API_BASE}/sub-phases/${subPhaseId}/updates`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`POST /sub-phases/${subPhaseId}/updates failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Drives the real login -> TOTP UI flow:
// - A fresh account (never completed setup) is shown the QR setup screen,
//   which also renders the raw secret as a manual-entry fallback (real
//   product UX) — we scrape that secret from the DOM and compute a real code
//   via otplib, exactly as a human copying it into an authenticator app
//   would end up doing.
// - An already-confirmed account is shown the code-only screen with no
//   secret in the DOM; the caller must pass `totpSecret` (e.g. the value
//   `createEntrepreneur()` returned, or the seeded fixed secret) so we can
//   compute a valid code.
export async function loginViaUi(page: Page, email: string, password: string, totpSecret?: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();

  const codeInput = page.getByTestId("totp-code-input");
  await expect(codeInput).toBeVisible();

  const manualSecret = page.getByTestId("totp-manual-secret");
  const isSetupScreen = (await manualSecret.count()) > 0;

  let code: string;
  if (isSetupScreen) {
    const secret = await manualSecret.innerText();
    code = authenticator.generate(secret.trim());
  } else {
    if (!totpSecret) {
      throw new Error(`loginViaUi: ${email} shows the returning-user code screen but no totpSecret was provided`);
    }
    code = authenticator.generate(totpSecret);
  }

  await codeInput.fill(code);
  await page.getByRole("button", { name: /^(אישור והפעלה|כניסה)$/ }).click();

  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
}

export async function loginAsAdminViaUi(page: Page): Promise<void> {
  await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD, E2E_SEEDED_TOTP_SECRET);
}
