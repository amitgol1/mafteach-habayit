import { expect, test } from "@playwright/test";
import { apiCreateProject, apiCreateUser, createEntrepreneur, loginViaUi } from "./helpers/api";

test("an entrepreneur only sees their own projects and users, not another entrepreneur's", async ({ page }) => {
  const entrepreneurA = await createEntrepreneur();
  const entrepreneurB = await createEntrepreneur();

  const projectAName = `פרויקט של יזם א ${Date.now()}`;
  await apiCreateProject(entrepreneurA.token, { name: projectAName, location: "פתח תקווה" });
  const projectBName = `פרויקט של יזם ב ${Date.now()}`;
  await apiCreateProject(entrepreneurB.token, { name: projectBName, location: "אשקלון" });

  const collaboratorAName = `איש מקצוע של יזם א ${Date.now()}`;
  await apiCreateUser(entrepreneurA.token, {
    name: collaboratorAName,
    email: `collab-a-${Date.now()}@e2e.test`,
    password: "password123",
    role: "COLLABORATOR",
    trade: "ELECTRICIAN",
  });
  const collaboratorBName = `איש מקצוע של יזם ב ${Date.now()}`;
  await apiCreateUser(entrepreneurB.token, {
    name: collaboratorBName,
    email: `collab-b-${Date.now()}@e2e.test`,
    password: "password123",
    role: "COLLABORATOR",
    trade: "ELECTRICIAN",
  });

  await loginViaUi(page, entrepreneurA.email, "password123");

  await expect(page.getByRole("heading", { name: projectAName, level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: projectBName, level: 2 })).not.toBeVisible();

  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: collaboratorAName })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: collaboratorBName })).toHaveCount(0);
});

test("hitting the 5-project quota shows the API's Hebrew error in the creation form", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  for (let i = 0; i < 5; i++) {
    await apiCreateProject(entrepreneur.token, { name: `פרויקט מכסה ${i} ${Date.now()}`, location: "כפר סבא" });
  }

  await loginViaUi(page, entrepreneur.email, "password123");
  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();

  await page.getByLabel("שם הפרויקט").fill(`פרויקט מכסה שישי ${Date.now()}`);
  await page.getByLabel("מיקום").fill("הוד השרון");
  await page.getByRole("button", { name: "צור פרויקט" }).click();

  await expect(page.getByText("הגעת למכסת הפרויקטים המקסימלית (5 פרויקטים)")).toBeVisible();
});
