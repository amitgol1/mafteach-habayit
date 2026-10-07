import { expect, test, type Page } from "@playwright/test";
import {
  call,
  createProject,
  findUserByEmail,
  apiLogin,
  qaAdmin,
  type Session,
} from "./helpers/api";
import { QA_PASSWORD, qaEmail, qaName, trackUser } from "./helpers/registry";
import { acceptNextDialog, loginViaUi, openAdminUsers, sessionFromPage, useAdminSession, useSession } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

const CONFLICT_MESSAGE = "יש למחוק את הפרויקטים של היזם לפני מחיקתו";

let entName: string;
let entEmail: string;
let entId: number;
let entSecret: string;
let entSession: Session;
let collabName: string;
let collabEmail: string;
let collabId: number;
let projectId: number;

function entNode(page: Page, email: string) {
  return page.getByTestId("user-tree").locator("> div").filter({ hasText: email });
}

test.beforeAll(() => {
  entName = qaName("ent-ui");
  entEmail = qaEmail("ent-ui");
  collabEmail = qaEmail("collab-ui");
  collabName = qaName("collab-ui");
});

test("SUPER_ADMIN creates an ENTREPRENEUR via the UI and sees it in the user tree", async ({ page }) => {
  await useAdminSession(page);
  await openAdminUsers(page);

  await expect(page.getByLabel("הרשאת מערכת")).toHaveValue("יזם");
  await expect(page.getByLabel("תחום עיסוק")).toHaveCount(0);

  await page.getByLabel("שם מלא").fill(entName);
  await page.getByLabel("אימייל / שם משתמש").fill(entEmail);
  await page.getByLabel("סיסמה").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "צור משתמש" }).click();
  await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();

  const admin = await qaAdmin();
  const created = await findUserByEmail(admin.token, entEmail);
  expect(created).toBeTruthy();
  trackUser(created.id);
  entId = created.id;
  expect(created.role).toBe("ENTREPRENEUR");
  expect(created.name).toBe(entName);

  const node = entNode(page, entEmail);
  await expect(node).toBeVisible();
  await expect(node).toContainText(entName);
  await expect(node).toContainText("אין אנשי מקצוע משויכים עדיין");
});

test("SUPER_ADMIN edits the entrepreneur's name; it persists after reload", async ({ page }) => {
  await useAdminSession(page);
  await openAdminUsers(page);

  const newName = qaName("ent-ui-renamed");
  const node = entNode(page, entEmail);
  await node.getByRole("button", { name: "ערוך", exact: true }).first().click();
  await node.getByLabel("שם מלא (עריכה)").fill(newName);
  await node.getByRole("button", { name: "שמור שינויים" }).click();
  await expect(node.getByLabel("שם מלא (עריכה)")).toHaveCount(0);
  await expect(node).toContainText(newName);

  await page.reload();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();
  await expect(entNode(page, entEmail)).toContainText(newName);

  const admin = await qaAdmin();
  expect((await findUserByEmail(admin.token, entEmail)).name).toBe(newName);
  entName = newName;
});

test("the entrepreneur completes first-login TOTP setup via the UI and creates a COLLABORATOR with a trade", async ({
  page,
}) => {
  entSecret = await loginViaUi(page, entEmail, QA_PASSWORD);
  expect(entSecret.length).toBeGreaterThan(10);
  entSession = await sessionFromPage(page, entSecret);

  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();
  await expect(page.getByLabel("הרשאת מערכת")).toHaveValue("איש מקצוע");

  await page.getByLabel("שם מלא").fill(collabName);
  await page.getByLabel("אימייל / שם משתמש").fill(collabEmail);
  await page.getByLabel("סיסמה").fill(QA_PASSWORD);
  await page.getByLabel("תחום עיסוק").selectOption({ label: "חשמלאי" });
  await page.getByRole("button", { name: "צור משתמש" }).click();
  await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();

  const admin = await qaAdmin();
  const created = await findUserByEmail(admin.token, collabEmail);
  expect(created).toBeTruthy();
  trackUser(created.id);
  collabId = created.id;
  expect(created.role).toBe("COLLABORATOR");
  expect(created.trade).toBe("ELECTRICIAN");

  await expect(page.getByTestId("user-list-flat")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: collabEmail })).toContainText("חשמלאי");
});

test("the entrepreneur edits the collaborator's name and trade; both persist after reload", async ({ page }) => {
  await useSession(page, entSession);
  await page.goto("/");
  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();

  const newName = qaName("collab-ui-renamed");
  const row = page.getByRole("listitem").filter({ hasText: collabEmail });
  await row.getByRole("button", { name: "ערוך", exact: true }).click();
  await row.getByLabel("שם מלא (עריכה)").fill(newName);
  await row.getByLabel("תחום עיסוק (עריכה)").selectOption({ label: "אינסטלטור" });
  await row.getByRole("button", { name: "שמור שינויים" }).click();
  await expect(row.getByLabel("שם מלא (עריכה)")).toHaveCount(0);
  await expect(row).toContainText(newName);
  await expect(row).toContainText("אינסטלטור");

  await page.reload();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();
  const reloaded = page.getByRole("listitem").filter({ hasText: collabEmail });
  await expect(reloaded).toContainText(newName);
  await expect(reloaded).toContainText("אינסטלטור");
  collabName = newName;
});

test("SUPER_ADMIN's tree nests the collaborator under its entrepreneur", async ({ page }) => {
  await useAdminSession(page);
  await openAdminUsers(page);
  const node = entNode(page, entEmail);
  await expect(node).toBeVisible();
  const row = node.getByRole("listitem").filter({ hasText: collabEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText(collabName);
  await expect(row).toContainText("אינסטלטור");
  await expect(node).not.toContainText("אין אנשי מקצוע משויכים עדיין");
});

test("an entrepreneur's user list is scoped to itself and its collaborators, and it cannot create an ENTREPRENEUR (API)", async () => {
  const ent = entSession;
  const list = await call(ent.token, "GET", "/users");
  expect(list.status).toBe(200);
  const emails = (list.json as { email: string }[]).map((u) => u.email);
  expect(emails).toContain(collabEmail);
  expect(emails.every((e) => e === entEmail || e === collabEmail)).toBe(true);
  // cannot create an entrepreneur or an admin-role user
  const bad = await call(ent.token, "POST", "/users", {
    name: qaName("should-not-exist"),
    email: qaEmail("should-not-exist"),
    password: QA_PASSWORD,
    role: "ENTREPRENEUR",
  });
  expect(bad.status).toBe(400);
  const tree = await call(ent.token, "GET", "/users/tree");
  expect(tree.status).toBe(403);
});

test("admin resets the collaborator's 2FA via the UI; next login requires fresh TOTP setup", async ({ page }) => {
  // Confirm 2FA for the collaborator first (API, fresh-account setup flow).
  const first = await apiLogin(collabEmail, QA_PASSWORD);
  expect(first.totpSecret.length).toBeGreaterThan(10);

  await useAdminSession(page);
  await openAdminUsers(page);
  const row = entNode(page, entEmail).getByRole("listitem").filter({ hasText: collabEmail });
  const dialogMessage = acceptNextDialog(page);
  const resetResponse = page.waitForResponse((r) => r.url().includes("/reset-totp") && r.request().method() === "POST");
  await row.getByRole("button", { name: "איפוס אימות דו-שלבי" }).click();
  expect(await dialogMessage).toContain(collabName);
  expect((await resetResponse).status()).toBe(200);

  const login = await call(null, "POST", "/auth/login", { email: collabEmail, password: QA_PASSWORD });
  expect(login.json.status).toBe("totp_setup_required");

  // The old secret no longer works; a fresh setup via the UI succeeds.
  const secondSecret = await loginViaUi(page, collabEmail, QA_PASSWORD);
  expect(secondSecret).not.toBe(first.totpSecret);
});

test("deleting an entrepreneur who owns a project is blocked with the Hebrew 409 (UI + API)", async ({ page }) => {
  const admin = await qaAdmin();
  const project = await createProject(admin.token, {
    name: qaName("proj-owned"),
    location: "QA",
    entrepreneurId: entId,
  });
  projectId = project.id;

  const api = await call(admin.token, "DELETE", `/users/${entId}`);
  expect(api.status).toBe(409);
  expect(api.json.error).toBe(CONFLICT_MESSAGE);

  await useAdminSession(page);
  await openAdminUsers(page);
  const node = entNode(page, entEmail);
  const dialogMessage = acceptNextDialog(page);
  await node.locator("> div").first().getByRole("button", { name: "מחק", exact: true }).click();
  expect(await dialogMessage).toContain(entName);
  await expect(page.getByText(CONFLICT_MESSAGE)).toBeVisible();
  await expect(entNode(page, entEmail)).toBeVisible();
  expect((await findUserByEmail(admin.token, entEmail))?.id).toBe(entId);
});

test("deleting the project via the project page succeeds and cascades", async ({ page }) => {
  await useAdminSession(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("QA-");
  const dialogMessage = acceptNextDialog(page);
  await page.getByRole("button", { name: "מחק פרויקט" }).click();
  expect(await dialogMessage).toContain("לא ניתן לבטל");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();

  const admin = await qaAdmin();
  const after = await call(admin.token, "GET", `/projects/${projectId}`);
  expect(after.status).toBe(404);
});

test("admin deletes the collaborator via the UI", async ({ page }) => {
  await useAdminSession(page);
  await openAdminUsers(page);
  const row = entNode(page, entEmail).getByRole("listitem").filter({ hasText: collabEmail });
  await expect(row).toBeVisible();
  const dialogMessage = acceptNextDialog(page);
  await row.getByRole("button", { name: "מחק", exact: true }).click();
  expect(await dialogMessage).toContain(collabName);
  await expect(entNode(page, entEmail).getByRole("listitem").filter({ hasText: collabEmail })).toHaveCount(0);

  const admin = await qaAdmin();
  expect(await findUserByEmail(admin.token, collabEmail)).toBeUndefined();
  const login = await call(null, "POST", "/auth/login", { email: collabEmail, password: QA_PASSWORD });
  expect(login.status).toBe(401);
  expect(collabId).toBeGreaterThan(0);
});

test("admin deletes the now project-free entrepreneur via the UI", async ({ page }) => {
  await useAdminSession(page);
  await openAdminUsers(page);
  const node = entNode(page, entEmail);
  await expect(node).toBeVisible();
  const dialogMessage = acceptNextDialog(page);
  await node.locator("> div").first().getByRole("button", { name: "מחק", exact: true }).click();
  await dialogMessage;
  await expect(entNode(page, entEmail)).toHaveCount(0);

  const admin = await qaAdmin();
  expect(await findUserByEmail(admin.token, entEmail)).toBeUndefined();
});
