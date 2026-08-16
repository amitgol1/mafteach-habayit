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

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR";
  trade: string | null;
}

export function apiCreateUser(
  token: string,
  payload: { name: string; email: string; password: string; role: "ADMIN" | "COLLABORATOR"; trade?: string }
): Promise<ApiUser> {
  return request("/users", { method: "POST", headers: authHeaders(token), body: JSON.stringify(payload) });
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
