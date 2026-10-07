import fs from "node:fs";
import path from "node:path";
import { authenticator } from "otplib";
import { loadLiveEnv } from "./env";
import { QA_PASSWORD, REGISTRY_DIR, qaEmail, qaName, trackProject, trackUser } from "./registry";

const env = loadLiveEnv();

export function logTransient(line: string): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.appendFileSync(path.join(REGISTRY_DIR, "transient-errors.log"), line + "\n");
}

// /auth/login (bcrypt compare) and POST /users (bcrypt hash) are CPU heavy on the Worker; on the
// free plan bursts of them intermittently return Cloudflare "Worker exceeded resource limits"
// (HTTP 503). Space them out so the suite does not trip that (the 503s are still logged/reported).
let lastBcrypt = 0;
export async function paceBcrypt(minGapMs = 4000): Promise<void> {
  const wait = lastBcrypt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastBcrypt = Date.now();
}

export const API = `${env.LIVE_BASE_URL}/api`;

export interface ApiResult<T = any> {
  status: number;
  json: T;
  headers: Headers;
}

export async function call<T = any>(
  token: string | null,
  method: string,
  path: string,
  body?: unknown | FormData
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  // Cloudflare edge errors (HTML 5xx, e.g. error 1102 "worker exceeded resource limits") are
  // retried and logged to the transient-error log so they are reported as findings, not hidden.
  if (path === "/auth/login" || (method === "POST" && path === "/users")) await paceBcrypt();
  let res: Response;
  let text: string;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${API}${path}`, { method, headers, body: payload });
    text = await res.text();
    const edgeError = res.status >= 500 && /^\s*<!DOCTYPE html/i.test(text);
    if (!edgeError) break;
    const code = /Error code (\d+)/i.exec(text)?.[1] ?? "unknown";
    const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() ?? "";
    logTransient(`${new Date().toISOString()} ${method} ${path} -> HTTP ${res.status} cf-error=${code} attempt=${attempt} ${title}`);
    if (attempt >= 4) break;
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

export async function ok<T = any>(p: Promise<ApiResult<T>>, expected: number | number[] = [200, 201, 204]): Promise<T> {
  const r = await p;
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(r.status)) {
    throw new Error(`unexpected status ${r.status}: ${JSON.stringify(r.json)?.slice(0, 300)}`);
  }
  return r.json as T;
}

export interface Session {
  token: string;
  user: { id: number; name: string; email: string; role: string; trade: string | null };
  totpSecret: string;
}

// Walks login -> TOTP over HTTP. A fresh account gets /totp/setup (the
// response returns the secret) + /totp/confirm; a returning one needs its secret.
export async function apiLogin(email: string, password: string, knownSecret?: string): Promise<Session> {
  const login = await ok<{ status: string; pendingToken: string }>(call(null, "POST", "/auth/login", { email, password }));
  if (login.status === "totp_setup_required") {
    const setup = await ok<{ secret: string }>(call(login.pendingToken, "POST", "/auth/totp/setup", {}));
    const confirmed = await ok<{ token: string; user: Session["user"] }>(
      call(login.pendingToken, "POST", "/auth/totp/confirm", { code: authenticator.generate(setup.secret) })
    );
    return { token: confirmed.token, user: confirmed.user, totpSecret: setup.secret };
  }
  if (!knownSecret) throw new Error(`apiLogin: ${email} already has TOTP configured and no secret was supplied`);
  const verified = await ok<{ token: string; user: Session["user"] }>(
    call(login.pendingToken, "POST", "/auth/totp/verify", { code: authenticator.generate(knownSecret) })
  );
  return { token: verified.token, user: verified.user, totpSecret: knownSecret };
}

let adminSession: Session | null = null;

export async function qaAdmin(): Promise<Session> {
  if (!adminSession) {
    // One bcrypt-costing admin login per run: globalSetup logs in and hands the session to the
    // worker and teardown through this (never printed) env var.
    const cached = process.env.LIVE_QA_SESSION_CACHE;
    if (cached) {
      adminSession = JSON.parse(cached) as Session;
    } else {
      adminSession = await apiLogin(env.LIVE_QA_ADMIN_EMAIL, env.LIVE_QA_ADMIN_PASSWORD, env.LIVE_QA_ADMIN_TOTP_SECRET);
      process.env.LIVE_QA_SESSION_CACHE = JSON.stringify(adminSession);
    }
  }
  return adminSession;
}

export interface QaUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  trade: string | null;
}

export async function createEntrepreneur(suffix: string): Promise<QaUser> {
  const admin = await qaAdmin();
  const name = qaName(suffix);
  const email = qaEmail(suffix);
  const r = await call(admin.token, "POST", "/users", { name, email, password: QA_PASSWORD, role: "ENTREPRENEUR" });
  if (r.status !== 201) throw new Error(`create entrepreneur failed: ${r.status} ${JSON.stringify(r.json)}`);
  trackUser(r.json.id);
  return { id: r.json.id, name, email, password: QA_PASSWORD, role: "ENTREPRENEUR", trade: null };
}

export async function createCollaborator(entrepreneurToken: string, suffix: string, trade: string): Promise<QaUser> {
  const name = qaName(suffix);
  const email = qaEmail(suffix);
  const r = await call(entrepreneurToken, "POST", "/users", { name, email, password: QA_PASSWORD, role: "COLLABORATOR", trade });
  if (r.status !== 201) throw new Error(`create collaborator failed: ${r.status} ${JSON.stringify(r.json)}`);
  trackUser(r.json.id);
  return { id: r.json.id, name, email, password: QA_PASSWORD, role: "COLLABORATOR", trade };
}

export async function createProject(token: string, payload: Record<string, unknown>): Promise<{ id: number; name: string }> {
  const r = await call(token, "POST", "/projects", payload);
  if (r.status !== 201) throw new Error(`create project failed: ${r.status} ${JSON.stringify(r.json)}`);
  trackProject(r.json.id);
  return r.json;
}

export function findProjectByName(token: string, name: string): Promise<any | undefined> {
  return call<any[]>(token, "GET", "/projects").then((r) => (r.json as any[]).find((p) => p.name === name));
}

export async function findUserByEmail(token: string, email: string): Promise<any | undefined> {
  const r = await call<any[]>(token, "GET", "/users");
  return (r.json as any[]).find((u) => u.email === email);
}

export async function postUpdate(
  token: string,
  path: string,
  fields: { subject?: string; description?: string }
): Promise<ApiResult> {
  const fd = new FormData();
  if (fields.subject) fd.append("subject", fields.subject);
  if (fields.description) fd.append("description", fields.description);
  return call(token, "POST", path, fd);
}
