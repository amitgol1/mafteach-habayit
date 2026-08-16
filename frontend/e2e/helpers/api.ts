import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Talks directly to the isolated e2e backend (port 4001) to set up fixtures
// (users/projects/units/phases/sub-phases) that have no creation UI, or where
// UI-driven setup would be slower/flakier than the test actually needs.
const API_BASE = "http://localhost:4001/api";

export const ADMIN_EMAIL = "admin@mafteach-habayit.local";
export const ADMIN_PASSWORD = "admin123";

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

export async function apiLogin(email: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.token;
}

export async function adminToken(): Promise<string> {
  return apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
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
export async function createEntrepreneur(): Promise<{ id: number; name: string; email: string; token: string }> {
  const admin = await adminToken();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `יזם בדיקה ${suffix}`;
  const email = `entrepreneur-${suffix}@e2e.test`;
  const password = "password123";
  const user = await apiCreateUser(admin, { name, email, password, role: "ENTREPRENEUR" });
  const token = await apiLogin(email, password);
  return { id: user.id, name, email, token };
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
    participants?: { trade: string; userId: number }[];
    entrepreneurId?: number;
  }
): Promise<ApiProject> {
  return request("/projects", { method: "POST", headers: authHeaders(token), body: JSON.stringify(payload) });
}

export interface ApiUnit {
  id: number;
}

export function apiCreateUnit(token: string, projectId: number, identifier: string): Promise<ApiUnit> {
  return request("/units", { method: "POST", headers: authHeaders(token), body: JSON.stringify({ projectId, identifier }) });
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

export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
}

export async function loginAsAdminViaUi(page: Page): Promise<void> {
  await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}
