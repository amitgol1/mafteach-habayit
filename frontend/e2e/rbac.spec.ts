import { expect, test } from "@playwright/test";
import { apiCreateProject, apiCreateUser, apiLoginWithTotp, createEntrepreneur, loginViaUi } from "./helpers/api";

test.describe("collaborator RBAC", () => {
  const email = `rbac-collab-${Date.now()}@e2e.test`;
  const password = "password123";
  let assignedProjectName: string;
  let otherProjectName: string;
  let totpSecret: string;

  test.beforeAll(async () => {
    const { token } = await createEntrepreneur();
    const user = await apiCreateUser(token, {
      name: "שרברב RBAC",
      email,
      password,
      role: "COLLABORATOR",
      trade: "PLUMBER",
    });
    // Complete TOTP setup once via the API so every UI login below hits the
    // returning-user code screen consistently (this account is reused across
    // all three tests in this file — leaving setup to the first UI login
    // would race across parallel workers/tests, per docs/specs/totp-2fa.md).
    ({ totpSecret } = await apiLoginWithTotp(email, password));

    assignedProjectName = `פרויקט משויך ${Date.now()}`;
    await apiCreateProject(token, {
      name: assignedProjectName,
      location: "מודיעין",
      participants: [{ trade: "PLUMBER", userId: user.id }],
    });

    otherProjectName = `פרויקט לא משויך ${Date.now()}`;
    await apiCreateProject(token, { name: otherProjectName, location: "כפר סבא" });
  });

  test("dashboard shows only the assigned project", async ({ page }) => {
    await loginViaUi(page, email, password, totpSecret);

    await expect(page.getByRole("heading", { name: assignedProjectName, level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: otherProjectName, level: 2 })).not.toBeVisible();
  });

  test("the Admin nav link is absent for a collaborator", async ({ page }) => {
    await loginViaUi(page, email, password, totpSecret);
    await expect(page.getByRole("link", { name: "ניהול", exact: true })).toHaveCount(0);
  });

  test("navigating directly to /admin does not grant access", async ({ page }) => {
    await loginViaUi(page, email, password, totpSecret);
    await page.goto("/admin");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  });
});
