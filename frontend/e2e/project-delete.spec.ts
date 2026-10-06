import { expect, test } from "@playwright/test";
import { apiCreateProject, createEntrepreneur, loginAsAdminViaUi, loginViaUi } from "./helpers/api";

test("SUPER_ADMIN deletes a project via the project page", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  const projectName = `פרויקט למחיקה - מנהל ${Date.now()}`;
  const project = await apiCreateProject(entrepreneur.token, {
    name: projectName,
    location: "חיפה",
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "מחק פרויקט" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  await expect(page.getByRole("heading", { name: projectName, level: 2 })).toHaveCount(0);
});

test("ENTREPRENEUR deletes their own project via the project page", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  const projectName = `פרויקט למחיקה - יזם ${Date.now()}`;
  const project = await apiCreateProject(entrepreneur.token, {
    name: projectName,
    location: "אשדוד",
  });

  await loginViaUi(page, entrepreneur.email, "password123", entrepreneur.totpSecret);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "מחק פרויקט" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  await expect(page.getByRole("heading", { name: projectName, level: 2 })).toHaveCount(0);
});
