import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { call, createEntrepreneur, createProject, qaAdmin, type QaUser } from "./helpers/api";
import { qaName } from "./helpers/registry";
import { acceptNextDialog, useAdminSession } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

const FIXTURE = path.resolve(process.cwd(), "e2e/fixtures/test-image.png");

let ent: QaUser;
let projectId: number;
let projectName: string;
let uploadUrl: string | null = null;
const SUB1 = () => qaName("sub-1");
const SUB2 = () => qaName("sub-2");
const SUBE = () => qaName("sub-e");

const tree = (page: Page) => page.getByTestId("project-tree");
const overallBadge = (page: Page) => page.locator("h1 + span");

function unitSection(page: Page, identifier: string) {
  return tree(page)
    .locator("> div")
    .filter({ has: page.getByRole("heading", { name: identifier, level: 3, exact: true }) });
}

async function getProject() {
  const admin = await qaAdmin();
  return (await call(admin.token, "GET", `/projects/${projectId}`)).json;
}

async function selectPhaseStatus(page: Page, phaseLabel: string, statusLabel: string) {
  const select = page.getByLabel(`סטטוס שלב: ${phaseLabel}`);
  await select.selectOption({ label: statusLabel });
  await expect(select).toBeEnabled();
}

test.beforeAll(async () => {
  ent = await createEntrepreneur("ent-structure");
  projectName = qaName("proj-structure");
  const admin = await qaAdmin();
  const p = await createProject(admin.token, {
    name: projectName,
    location: "QA נתניה",
    totalBudget: 100000,
    currentStage: "SKELETON",
    projectType: "PRIVATE_HOUSES",
    entrepreneurId: ent.id,
  });
  projectId = p.id;
});

test("bulk unit generation follows the project type and keeps numbering after reload", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();
  await expect(page.getByText("אין יחידות עדיין")).toBeVisible();

  await page.getByRole("button", { name: "+ יצירת יחידות אוטומטית" }).click();
  await page.getByLabel("מספר יחידות").fill("2");
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(tree(page).getByRole("heading", { name: "בית 1", level: 3 })).toBeVisible();
  await expect(tree(page).getByRole("heading", { name: "בית 2", level: 3 })).toBeVisible();

  await page.getByRole("button", { name: "+ יצירת יחידות אוטומטית" }).click();
  await page.getByLabel("מספר יחידות").fill("1");
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(tree(page).getByRole("heading", { name: "בית 3", level: 3 })).toBeVisible();

  await page.reload();
  for (const n of [1, 2, 3]) await expect(tree(page).getByRole("heading", { name: `בית ${n}`, level: 3 })).toBeVisible();
  expect((await getProject()).units.map((u: any) => u.identifier).sort()).toEqual(["בית 1", "בית 2", "בית 3"]);
});

test("units can be renamed, added and deleted through the UI", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);

  const renamed = qaName("unit-renamed");
  await page.getByRole("button", { name: "עריכת שם היחידה בית 2" }).click();
  await page.getByLabel("שם יחידה: בית 2").fill(renamed);
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(tree(page).getByRole("heading", { name: renamed, level: 3 })).toBeVisible();

  const manual = qaName("unit-manual");
  await page.getByRole("button", { name: "+ הוספת יחידה" }).click();
  await page.getByLabel("מזהה יחידה").fill(manual);
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(tree(page).getByRole("heading", { name: manual, level: 3 })).toBeVisible();

  await page.reload();
  await expect(tree(page).getByRole("heading", { name: renamed, level: 3 })).toBeVisible();
  await expect(tree(page).getByRole("heading", { name: "בית 2", level: 3 })).toHaveCount(0);
  await expect(tree(page).getByRole("heading", { name: manual, level: 3 })).toBeVisible();

  const msg = acceptNextDialog(page);
  await page.getByRole("button", { name: `מחיקת היחידה ${manual}` }).click();
  expect(await msg).toContain(manual);
  await expect(tree(page).getByRole("heading", { name: manual, level: 3 })).toHaveCount(0);
  await page.reload();
  await expect(tree(page).getByRole("heading", { name: manual, level: 3 })).toHaveCount(0);
  expect((await getProject()).units).toHaveLength(3);
});

test("changing the project type to a residential building switches the generated unit prefix", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "ערוך פרויקט" }).click();
  await expect(page.getByText("טוען משתמשים...")).toHaveCount(0);
  await page.getByLabel("סוג פרויקט").selectOption({ label: "בניין מגורים" });
  await page.getByRole("button", { name: "שמור שינויים" }).click();
  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).toHaveCount(0);

  await page.getByRole("button", { name: "+ יצירת יחידות אוטומטית" }).click();
  await page.getByLabel("מספר יחידות").fill("1");
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(tree(page).getByRole("heading", { name: "דירה 4", level: 3 })).toBeVisible();
  await page.reload();
  await expect(tree(page).getByRole("heading", { name: "דירה 4", level: 3 })).toBeVisible();
});

test("phases and sub-phases are added through the UI and persist", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  const section = unitSection(page, "בית 1");

  await section.getByRole("button", { name: "+ הוספת שלב" }).click();
  await section.getByLabel("שלב", { exact: true }).selectOption({ label: "שלד" });
  await section.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByLabel("סטטוס שלב: שלד")).toHaveValue("NOT_STARTED");

  await section.getByRole("button", { name: "+ הוספת שלב" }).click();
  await section.getByLabel("שלב", { exact: true }).selectOption({ label: "חשמל" });
  await section.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByLabel("סטטוס שלב: חשמל")).toHaveValue("NOT_STARTED");

  const skeleton = tree(page).locator("div.panel.overflow-hidden").filter({ has: page.getByLabel("סטטוס שלב: שלד") });
  for (const name of [SUB1(), SUB2()]) {
    await skeleton.getByRole("button", { name: "+ הוספת תת-שלב" }).click();
    await skeleton.getByLabel("שם תת-השלב").fill(name);
    await skeleton.getByRole("button", { name: "הוספה" }).click();
    await expect(skeleton.getByText(name, { exact: true })).toBeVisible();
  }
  const electricity = tree(page).locator("div.panel.overflow-hidden").filter({ has: page.getByLabel("סטטוס שלב: חשמל") });
  await electricity.getByRole("button", { name: "+ הוספת תת-שלב" }).click();
  await electricity.getByLabel("שם תת-השלב").fill(SUBE());
  await electricity.getByRole("button", { name: "הוספה" }).click();
  await expect(electricity.getByText(SUBE(), { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("סטטוס שלב: שלד")).toBeVisible();
  await expect(page.getByLabel(`סטטוס תת-שלב: ${SUB1()}`)).toHaveValue("NOT_STARTED");
  await expect(page.getByLabel(`סטטוס תת-שלב: ${SUB2()}`)).toHaveValue("NOT_STARTED");
  await expect(page.getByLabel(`סטטוס תת-שלב: ${SUBE()}`)).toHaveValue("NOT_STARTED");
  const unit = (await getProject()).units.find((u: any) => u.identifier === "בית 1");
  expect(unit.phases.map((p: any) => p.name)).toEqual(["SKELETON", "ELECTRICITY"]);
});

test("phase status changes drive the derived project overallStatus (BLOCKED > IN_PROGRESS > all-COMPLETED > NOT_STARTED)", async ({
  page,
}) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await expect(overallBadge(page)).toHaveText("טרם החל");

  await selectPhaseStatus(page, "שלד", "בביצוע");
  await expect(overallBadge(page)).toHaveText("בביצוע");
  expect((await getProject()).overallStatus).toBe("IN_PROGRESS");

  await selectPhaseStatus(page, "חשמל", "מעוכב");
  await expect(overallBadge(page)).toHaveText("מעוכב");
  expect((await getProject()).overallStatus).toBe("BLOCKED");

  await selectPhaseStatus(page, "חשמל", "הושלם");
  await expect(overallBadge(page)).toHaveText("בביצוע");

  await selectPhaseStatus(page, "שלד", "הושלם");
  await expect(overallBadge(page)).toHaveText("הושלם");
  expect((await getProject()).overallStatus).toBe("COMPLETED");

  await page.goto("/");
  const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name: projectName, level: 2 }) });
  await expect(card).toContainText("הושלם");

  await page.goto(`/projects/${projectId}`);
  await selectPhaseStatus(page, "חשמל", "טרם החל");
  await expect(overallBadge(page)).toHaveText("טרם החל");
  expect((await getProject()).overallStatus).toBe("NOT_STARTED");

  // sub-phase status is independent of the rollup
  const sub = page.getByLabel(`סטטוס תת-שלב: ${SUB1()}`);
  await sub.selectOption({ label: "הושלם" });
  await expect(sub).toBeEnabled();
  await expect(overallBadge(page)).toHaveText("טרם החל");

  await page.reload();
  await expect(page.getByLabel("סטטוס שלב: שלד")).toHaveValue("COMPLETED");
  await expect(page.getByLabel("סטטוס שלב: חשמל")).toHaveValue("NOT_STARTED");
  await expect(page.getByLabel(`סטטוס תת-שלב: ${SUB1()}`)).toHaveValue("COMPLETED");
  await expect(overallBadge(page)).toHaveText("טרם החל");
});

test("project-level and sub-phase feeds are independent; text updates persist", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  const projectMsg = qaName("project-update");
  await page.getByPlaceholder("תיאור...").fill(projectMsg);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(projectMsg)).toBeVisible();
  await page.reload();
  await expect(page.getByText(projectMsg)).toBeVisible();

  await page.getByText(SUB1(), { exact: true }).click();
  await expect(page.getByText(projectMsg)).toHaveCount(0);
  const subject = qaName("subject");
  const desc = qaName("sub-update");
  await page.getByPlaceholder("נושא").fill(subject);
  await page.getByPlaceholder("תיאור...").fill(desc);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(subject)).toBeVisible();
  await expect(page.getByText(desc)).toBeVisible();

  await page.getByText(SUB1(), { exact: true }).click(); // deselect -> back to project feed
  await expect(page.getByText(projectMsg)).toBeVisible();
  await expect(page.getByText(desc)).toHaveCount(0);

  const sp = (await getProject()).units.flatMap((u: any) => u.phases).flatMap((p: any) => p.subPhases);
  const sub1 = sp.find((s: any) => s.name === SUB1());
  const admin = await qaAdmin();
  const feed = (await call(admin.token, "GET", `/sub-phases/${sub1.id}/updates`)).json;
  expect(feed.updates).toHaveLength(1);
  expect(feed.updates[0]).toMatchObject({ subject, description: desc });
  expect(feed.updates[0].user.name).toBeTruthy();

  const empty = await call(admin.token, "POST", `/sub-phases/${sub1.id}/updates`, undefined);
  expect(empty.status).toBe(400);
  expect(((await call(admin.token, "GET", `/sub-phases/${sub1.id}/updates`)).json as any).updates).toHaveLength(1);
});

test("the single image upload in the suite is attached to a sub-phase update and its URL serves the same bytes", async ({
  page,
}) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await page.getByText(SUB2(), { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "שליחה" }).click();

  const link = page.getByRole("link", { name: "הורדה" });
  await expect(link).toBeVisible();
  const img = page.locator("article img").first();
  await expect(img).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/uploads\//);
  expect(await img.getAttribute("src")).toBe(href);
  uploadUrl = href;

  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const body = await res.body();
  expect(body.equals(fs.readFileSync(FIXTURE))).toBe(true);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  const ranged = await page.request.get(href!, { headers: { Range: "bytes=0-9" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(10);
});

test("payments linked to unit / phase / sub-phase / none roll up into totals and the breakdown", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "כספים" }).click();

  const totalsValue = (label: string) => page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  await expect(totalsValue("סה״כ לתשלום")).toContainText("100,000");
  await expect(totalsValue("שולם")).toContainText("0");
  await expect(totalsValue("יתרה לתשלום")).toContainText("100,000");

  async function addPayment(amount: string, link?: { unit?: string; phase?: string; subPhase?: string }) {
    await page.getByLabel("סכום ששולם").fill(amount);
    if (link?.unit) await page.getByLabel("יחידה", { exact: true }).selectOption({ label: link.unit });
    if (link?.phase) await page.getByLabel("שלב", { exact: true }).selectOption({ label: link.phase });
    if (link?.subPhase) await page.getByLabel("תת-שלב", { exact: true }).selectOption({ label: link.subPhase });
    await page.getByRole("button", { name: "הוספת תשלום" }).click();
  }
  const records = page.getByTestId("financial-record");

  await addPayment("1000", { unit: "בית 1" });
  await expect(records).toHaveCount(1);
  await expect(records.filter({ hasText: "1,000" })).toContainText("בית 1");

  await addPayment("2000", { unit: "בית 1", phase: "שלד" });
  await expect(records).toHaveCount(2);
  await expect(records.filter({ hasText: "2,000" })).toContainText("בית 1 › שלד");

  await addPayment("3000", { unit: "בית 1", phase: "שלד", subPhase: SUB1() });
  await expect(records).toHaveCount(3);
  await expect(records.filter({ hasText: "3,000" })).toContainText(`בית 1 › שלד › ${SUB1()}`);

  await addPayment("500");
  await expect(records).toHaveCount(4);

  await expect(totalsValue("שולם")).toContainText("6,500");
  await expect(totalsValue("יתרה לתשלום")).toContainText("93,500");

  const breakdown = page.getByTestId("financial-breakdown");
  const unitBlock = breakdown.getByTestId("unit-breakdown").filter({ hasText: "בית 1" });
  await expect(unitBlock).toContainText("6,000");
  await expect(unitBlock.getByTestId("phase-breakdown")).toContainText("5,000");
  await expect(breakdown.getByTestId("general-breakdown")).toContainText("500");

  await page.reload();
  await page.getByRole("button", { name: "כספים" }).click();
  await expect(records).toHaveCount(4);
  await expect(totalsValue("שולם")).toContainText("6,500");

  const admin = await qaAdmin();
  const fin = (await call(admin.token, "GET", `/projects/${projectId}/financials`)).json;
  expect(fin.totals).toEqual({ totalDue: 100000, totalPaid: 6500, remaining: 93500 });
  expect(fin.records).toHaveLength(4);
});

test("financial API rejects conflicting links and supports deleting a record", async () => {
  const admin = await qaAdmin();
  const proj = await getProject();
  const unit = proj.units.find((u: any) => u.identifier === "בית 1");
  const phase = unit.phases[0];
  const fd = new FormData();
  fd.append("amountPaid", "1");
  fd.append("unitId", String(unit.id));
  fd.append("phaseId", String(phase.id));
  const both = await call(admin.token, "POST", `/projects/${projectId}/financials`, fd);
  expect(both.status).toBe(400);

  const fin = (await call(admin.token, "GET", `/projects/${projectId}/financials`)).json;
  expect(fin.records).toHaveLength(4);
  const general = fin.records.find((r: any) => r.unitId == null && r.phaseId == null && r.subPhaseId == null);
  const del = await call(admin.token, "DELETE", `/financial-records/${general.id}`);
  expect(del.status).toBe(204);
  const after = (await call(admin.token, "GET", `/projects/${projectId}/financials`)).json;
  expect(after.totals).toEqual({ totalDue: 100000, totalPaid: 6000, remaining: 94000 });
});

test("deleting the project via the UI cascades (units, updates, payments); uploaded file persistence is noted", async ({
  page,
}) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  const msg = acceptNextDialog(page);
  await page.getByRole("button", { name: "מחק פרויקט" }).click();
  expect(await msg).toContain(projectName);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: projectName, level: 2 })).toHaveCount(0);

  const admin = await qaAdmin();
  expect((await call(admin.token, "GET", `/projects/${projectId}`)).status).toBe(404);
  expect((await call(admin.token, "GET", `/projects/${projectId}/financials`)).status).toBe(404);
  expect((await call(admin.token, "GET", `/projects/${projectId}/updates`)).status).toBe(404);

  if (uploadUrl) {
    const res = await page.request.get(uploadUrl);
    test.info().annotations.push({
      type: "observation",
      description: `after project delete, uploaded file still served from KV: HTTP ${res.status()}`,
    });
  }
});
