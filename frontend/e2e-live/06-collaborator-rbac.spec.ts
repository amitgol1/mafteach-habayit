import { expect, test } from "@playwright/test";
import {
  apiLogin,
  call,
  createCollaborator,
  createEntrepreneur,
  createProject,
  postUpdate,
  qaAdmin,
  type QaUser,
  type Session,
} from "./helpers/api";
import { qaName } from "./helpers/registry";
import { loginViaUi, sessionFromPage, useSession } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

let ent: QaUser;
let entSession: Session;
let c1: QaUser; // assigned to sub-phase S1 of P1
let c2: QaUser; // participant of P2
let c1Session: Session;
let p1: { id: number; name: string };
let p2: { id: number; name: string };
let p3: { id: number; name: string };
let s1: { id: number; name: string };
let s2: { id: number; name: string };

test.beforeAll(async () => {
  ent = await createEntrepreneur("ent-rbac");
  entSession = await apiLogin(ent.email, ent.password); // fresh-account TOTP setup via API
  c1 = await createCollaborator(entSession.token, "collab-assigned", "MAIN_CONTRACTOR");
  c2 = await createCollaborator(entSession.token, "collab-participant", "PLUMBER");

  p1 = await createProject(entSession.token, { name: qaName("proj-assigned"), location: "QA" });
  p2 = await createProject(entSession.token, {
    name: qaName("proj-participant"),
    location: "QA",
    participants: [{ trade: "PLUMBER", userId: c2.id }],
  });
  p3 = await createProject(entSession.token, { name: qaName("proj-nobody"), location: "QA" });

  const t = entSession.token;
  const unit = (await call(t, "POST", "/units", { projectId: p1.id, identifier: "QA יחידה" })).json;
  const phase = (await call(t, "POST", "/phases", { unitId: unit.id, name: "SKELETON", order: 1 })).json;
  s1 = (await call(t, "POST", "/sub-phases", { phaseId: phase.id, name: qaName("s1") })).json;
  s2 = (await call(t, "POST", "/sub-phases", { phaseId: phase.id, name: qaName("s2") })).json;
  const assign = await call(t, "POST", `/sub-phases/${s1.id}/assignments`, { userId: c1.id });
  expect(assign.status).toBe(201);
});

test("entrepreneur sees exactly their own projects (tenant scoping) and can manage them", async ({ page }) => {
  await useSession(page, entSession);
  await page.goto("/");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.filter({ hasText: p1.name })).toHaveCount(1);
  await expect(headings.filter({ hasText: p2.name })).toHaveCount(1);
  await expect(headings.filter({ hasText: p3.name })).toHaveCount(1);
  await expect(headings).toHaveCount(3);

  await page.goto(`/projects/${p1.id}`);
  await expect(page.getByRole("button", { name: "ערוך פרויקט" })).toBeVisible();
  await expect(page.getByRole("button", { name: "כספים" })).toBeVisible();
});

test("entrepreneur is denied (read-only probe) on a project owned by someone else", async () => {
  const admin = await qaAdmin();
  const all = (await call(admin.token, "GET", "/projects")).json as { id: number; name: string }[];
  const foreign = all.find((p) => !p.name.startsWith("QA-"));
  test.skip(!foreign, "no non-QA project exists to probe against");
  const r = await call(entSession.token, "GET", `/projects/${foreign!.id}`);
  expect(r.status).toBe(403);
  const fin = await call(entSession.token, "GET", `/projects/${foreign!.id}/financials`);
  expect(fin.status).toBe(403);
});

test("assigned collaborator: first-login TOTP setup, sees only the assigned project, read-only tree, can post in the assigned sub-phase", async ({
  page,
}) => {
  const c1Secret = await loginViaUi(page, c1.email, c1.password);
  c1Session = await sessionFromPage(page, c1Secret);
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveCount(1);
  await expect(headings.first()).toHaveText(p1.name);

  await expect(page.getByRole("link", { name: "ניהול", exact: true })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL("/");

  await page.goto(`/projects/${p1.id}`);
  await expect(page.getByRole("heading", { name: p1.name, level: 1 })).toBeVisible();
  await expect(page.getByText(s1.name, { exact: true })).toBeVisible();
  await expect(page.getByText(s2.name, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ערוך פרויקט" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "מחק פרויקט" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "כספים" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ הוספת יחידה" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ הוספת שלב" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ הוספת תת-שלב" })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await page.getByText(s1.name, { exact: true }).click();
  const msg = qaName("collab-update");
  await page.getByPlaceholder("תיאור...").fill(msg);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(msg)).toBeVisible();

  for (const id of [p2.id, p3.id]) {
    await page.goto(`/projects/${id}`);
    await expect(page.getByText("אירעה שגיאה בטעינת הפרויקט")).toBeVisible();
  }
});

test("assigned collaborator API scoping: reads limited to P1, all writes outside their lane are 403", async () => {
  const t = c1Session.token;

  const list = (await call(t, "GET", "/projects")).json as { id: number }[];
  expect(list.map((p) => p.id)).toEqual([p1.id]);
  expect((await call(t, "GET", `/projects/${p1.id}`)).status).toBe(200);
  expect((await call(t, "GET", `/projects/${p2.id}`)).status).toBe(403);
  expect((await call(t, "GET", `/projects/${p3.id}`)).status).toBe(403);

  expect((await call(t, "GET", "/users")).status).toBe(403);
  expect((await call(t, "GET", "/users/tree")).status).toBe(403);
  expect((await call(t, "POST", "/users", { name: "x", email: "x@test.local", password: "x", role: "COLLABORATOR" })).status).toBe(403);
  expect((await call(t, "POST", "/projects", { name: "QA-nope", location: "x" })).status).toBe(403);
  expect((await call(t, "PATCH", `/projects/${p1.id}`, { name: "QA-hijack" })).status).toBe(403);
  expect((await call(t, "DELETE", `/projects/${p1.id}`)).status).toBe(403);
  expect((await call(t, "GET", `/projects/${p1.id}/financials`)).status).toBe(403);
  expect((await call(t, "POST", "/units", { projectId: p1.id, identifier: "QA-nope" })).status).toBe(403);
  expect((await call(t, "POST", "/sub-phases", { phaseId: 1, name: "QA-nope" })).status).toBe(403);

  // sub-phase posting: assigned S1 yes, unassigned S2 no; project feed of P1 readable
  expect((await postUpdate(t, `/sub-phases/${s1.id}/updates`, { description: qaName("api-s1") })).status).toBe(201);
  expect((await postUpdate(t, `/sub-phases/${s2.id}/updates`, { description: qaName("api-s2") })).status).toBe(403);
  expect((await call(t, `GET`, `/sub-phases/${s2.id}/updates`)).status).toBe(200); // view gate = project access
  expect((await call(t, "GET", `/projects/${p2.id}/updates`)).status).toBe(403);

  // the collaborator's own project was never mutated by the attempts above
  const admin = await qaAdmin();
  const proj = (await call(admin.token, "GET", `/projects/${p1.id}`)).json;
  expect(proj.name).toBe(p1.name);
});

test("participant collaborator sees only the project they participate in and can post project-level updates", async ({
  page,
}) => {
  const c2Session = await apiLogin(c2.email, c2.password);
  await useSession(page, c2Session);
  await page.goto("/");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveCount(1);
  await expect(headings.first()).toHaveText(p2.name);

  await page.goto(`/projects/${p2.id}`);
  await expect(page.getByRole("heading", { name: p2.name, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "כספים" })).toHaveCount(0);
  const msg = qaName("participant-update");
  await page.getByPlaceholder("תיאור...").fill(msg);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(msg)).toBeVisible();

  await page.goto(`/projects/${p1.id}`);
  await expect(page.getByText("אירעה שגיאה בטעינת הפרויקט")).toBeVisible();
});

test("the collaborator's updates are visible to the admin with the author attached", async () => {
  const admin = await qaAdmin();
  const feed = (await call(admin.token, "GET", `/sub-phases/${s1.id}/updates`)).json;
  const authors = feed.updates.map((u: any) => u.user.id);
  expect(authors).toContain(c1.id);
  const mine = feed.updates.find((u: any) => u.user.id === c1.id);
  expect(mine.user.role).toBe("COLLABORATOR");
  expect(mine.user.trade).toBe("MAIN_CONTRACTOR");
});

test("removing the assignment revokes the collaborator's access", async () => {
  const del = await call(entSession.token, "DELETE", `/sub-phases/${s1.id}/assignments/${c1.id}`);
  expect(del.status).toBe(204);
  const c = c1Session;
  expect(((await call(c.token, "GET", "/projects")).json as unknown[]).length).toBe(0);
  expect((await call(c.token, "GET", `/projects/${p1.id}`)).status).toBe(403);
});
