import { expect, test, type Page } from "@playwright/test";
import {
  apiLogin,
  call,
  createCollaborator,
  createEntrepreneur,
  findProjectByName,
  qaAdmin,
  type QaUser,
} from "./helpers/api";
import { qaName, trackProject } from "./helpers/registry";
import { useAdminSession } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

let ent: QaUser;
let architect: QaUser;
let plumber: QaUser;
let projectId: number;
const projectName = () => qaName("proj-full");
const editedName = () => qaName("proj-full-edited");

test.beforeAll(async () => {
  ent = await createEntrepreneur("ent-proj");
  const entSession = await apiLogin(ent.email, ent.password);
  architect = await createCollaborator(entSession.token, "architect", "ARCHITECT");
  plumber = await createCollaborator(entSession.token, "plumber", "PLUMBER");
});

async function openEditForm(page: Page) {
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "ערוך פרויקט" }).click();
  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).toBeVisible();
  // participant dropdowns load asynchronously; wait until the trade lists are populated
  await expect(page.getByText("טוען משתמשים...")).toHaveCount(0);
}

test("form rejects an empty required field without submitting", async ({ page }) => {
  await useAdminSession(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();
  await page.getByLabel("מיקום").fill("QA");
  await page.getByRole("button", { name: "צור פרויקט" }).click();
  await expect(page.locator("#name:invalid")).toHaveCount(1);
  await expect(page.getByText("הפרויקט נוצר בהצלחה")).toHaveCount(0);
});

test("SUPER_ADMIN creates a project with every field set via the UI", async ({ page }) => {
  await useAdminSession(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();
  await expect(page.getByText("טוען משתמשים...")).toHaveCount(0);
  await expect(page.getByText("טוען יזמים...")).toHaveCount(0);

  await page.getByLabel("יזם", { exact: true }).selectOption({ label: ent.name });
  await page.getByLabel("שם הפרויקט").fill(projectName());
  await page.getByLabel("מיקום").fill("QA הרצליה");
  await page.getByLabel("לקוחות / יזמים").fill("QA דנה ויוסי");
  await page.getByLabel("תקציב כולל").fill("750000");
  await page.getByLabel("שלב נוכחי").selectOption({ label: "שלד" });
  await page.getByLabel("סוג פרויקט").selectOption({ label: "בתים פרטיים" });
  await page.getByLabel("אדריכל", { exact: true }).selectOption({ label: architect.name });
  await page.getByRole("button", { name: "צור פרויקט" }).click();
  await expect(page.getByText("הפרויקט נוצר בהצלחה")).toBeVisible();

  const admin = await qaAdmin();
  const created = await findProjectByName(admin.token, projectName());
  expect(created, "project created through UI should be listed").toBeTruthy();
  projectId = created.id;
  trackProject(projectId);

  const full = (await call(admin.token, "GET", `/projects/${projectId}`)).json;
  expect(full).toMatchObject({
    name: projectName(),
    location: "QA הרצליה",
    owners: "QA דנה ויוסי",
    totalBudget: 750000,
    currentStage: "SKELETON",
    projectType: "PRIVATE_HOUSES",
    entrepreneurId: ent.id,
    overallStatus: "NOT_STARTED",
  });
  expect(full.participants.map((p: any) => [p.trade, p.userId])).toEqual([["ARCHITECT", architect.id]]);
});

test("created project shows on the dashboard and project page with its stage", async ({ page }) => {
  await useAdminSession(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: projectName(), level: 2 })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: projectName(), level: 1 })).toBeVisible();
  await expect(page.getByText("QA הרצליה", { exact: true })).toBeVisible();
  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toContainText("שלד");
  await expect(tracker).toContainText("1/10");
});

test("edit form is pre-filled with every persisted value", async ({ page }) => {
  await useAdminSession(page);
  await openEditForm(page);
  await expect(page.getByLabel("שם הפרויקט")).toHaveValue(projectName());
  await expect(page.getByLabel("מיקום")).toHaveValue("QA הרצליה");
  await expect(page.getByLabel("לקוחות / יזמים")).toHaveValue("QA דנה ויוסי");
  await expect(page.getByLabel("תקציב כולל")).toHaveValue("750000");
  await expect(page.getByLabel("שלב נוכחי")).toHaveValue("SKELETON");
  await expect(page.getByLabel("סוג פרויקט")).toHaveValue("PRIVATE_HOUSES");
  await expect(page.getByLabel("אדריכל", { exact: true })).toHaveValue(String(architect.id));
  await expect(page.getByLabel("אינסטלטור", { exact: true })).toHaveValue("");
});

test("editing every field (incl. participants) persists after reload", async ({ page }) => {
  await useAdminSession(page);
  await openEditForm(page);

  await page.getByLabel("שם הפרויקט").fill(editedName());
  await page.getByLabel("מיקום").fill("QA חיפה");
  await page.getByLabel("לקוחות / יזמים").fill("QA משפחת לוי");
  await page.getByLabel("תקציב כולל").fill("1250000");
  await page.getByLabel("שלב נוכחי").selectOption({ label: "חשמל" });
  await page.getByLabel("סוג פרויקט").selectOption({ label: "בניין מגורים" });
  await page.getByLabel("אדריכל", { exact: true }).selectOption({ label: "לא נבחר" });
  await page.getByLabel("אינסטלטור", { exact: true }).selectOption({ label: plumber.name });
  await page.getByRole("button", { name: "שמור שינויים" }).click();
  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: editedName(), level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: editedName(), level: 1 })).toBeVisible();
  await expect(page.getByText("QA חיפה", { exact: true })).toBeVisible();
  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toContainText("חשמל");
  await expect(tracker).toContainText("2/10");

  await page.getByRole("button", { name: "ערוך פרויקט" }).click();
  await expect(page.getByText("טוען משתמשים...")).toHaveCount(0);
  await expect(page.getByLabel("שם הפרויקט")).toHaveValue(editedName());
  await expect(page.getByLabel("מיקום")).toHaveValue("QA חיפה");
  await expect(page.getByLabel("לקוחות / יזמים")).toHaveValue("QA משפחת לוי");
  await expect(page.getByLabel("תקציב כולל")).toHaveValue("1250000");
  await expect(page.getByLabel("שלב נוכחי")).toHaveValue("ELECTRICITY");
  await expect(page.getByLabel("סוג פרויקט")).toHaveValue("RESIDENTIAL_BUILDING");
  await expect(page.getByLabel("אדריכל", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("אינסטלטור", { exact: true })).toHaveValue(String(plumber.id));

  const admin = await qaAdmin();
  const full = (await call(admin.token, "GET", `/projects/${projectId}`)).json;
  expect(full).toMatchObject({
    name: editedName(),
    location: "QA חיפה",
    owners: "QA משפחת לוי",
    totalBudget: 1250000,
    currentStage: "ELECTRICITY",
    projectType: "RESIDENTIAL_BUILDING",
    entrepreneurId: ent.id,
  });
  expect(full.participants.map((p: any) => [p.trade, p.userId])).toEqual([["PLUMBER", plumber.id]]);
});

test("editing one field alone keeps all other fields and participants intact", async ({ page }) => {
  await useAdminSession(page);
  await openEditForm(page);
  await page.getByLabel("תקציב כולל").fill("999000");
  await page.getByRole("button", { name: "שמור שינויים" }).click();
  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).toHaveCount(0);

  const admin = await qaAdmin();
  const full = (await call(admin.token, "GET", `/projects/${projectId}`)).json;
  expect(full).toMatchObject({
    name: editedName(),
    location: "QA חיפה",
    owners: "QA משפחת לוי",
    totalBudget: 999000,
    currentStage: "ELECTRICITY",
    projectType: "RESIDENTIAL_BUILDING",
  });
  expect(full.participants.map((p: any) => [p.trade, p.userId])).toEqual([["PLUMBER", plumber.id]]);
});

test("the API rejects invalid enum and participant input and unknown ids", async () => {
  const admin = await qaAdmin();
  const badStage = await call(admin.token, "PATCH", `/projects/${projectId}`, { currentStage: "NOPE" });
  expect(badStage.status).toBe(400);
  const badType = await call(admin.token, "PATCH", `/projects/${projectId}`, { projectType: "NOPE" });
  expect(badType.status).toBe(400);
  const dupTrade = await call(admin.token, "PATCH", `/projects/${projectId}`, {
    participants: [
      { trade: "PLUMBER", userId: plumber.id },
      { trade: "PLUMBER", userId: architect.id },
    ],
  });
  expect(dupTrade.status).toBe(400);
  const missingUser = await call(admin.token, "PATCH", `/projects/${projectId}`, {
    participants: [{ trade: "PLUMBER", userId: 2147483000 }],
  });
  expect(missingUser.status).toBe(400);
  const none = await call(admin.token, "GET", "/projects/2147483000");
  expect(none.status).toBe(404);
});
