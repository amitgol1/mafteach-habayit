import { expect, test } from "@playwright/test";
import { apiCreateProject, createEntrepreneur, loginAsAdminViaUi } from "./helpers/api";

test("editing a project's stage and budget persists after reload", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט לעריכה ${Date.now()}`;
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "נתניה",
    totalBudget: 10000,
    currentStage: "SKELETON",
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "ערוך פרויקט" }).click();
  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).toBeVisible();

  await page.getByLabel("תקציב כולל").fill("250000");
  await page.getByLabel("שלב נוכחי").selectOption({ label: "אינסטלציה" });
  await page.getByRole("button", { name: "שמור שינויים" }).click();

  await expect(page.getByRole("heading", { name: "עריכת פרויקט" })).not.toBeVisible();
  await expect(page.locator('section[aria-label="שלב הפרויקט"]')).toContainText("אינסטלציה");

  await page.reload();
  await expect(page.locator('section[aria-label="שלב הפרויקט"]')).toContainText("אינסטלציה");

  await page.getByRole("button", { name: "ערוך פרויקט" }).click();
  await expect(page.getByLabel("תקציב כולל")).toHaveValue("250000");
});
