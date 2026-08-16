import { expect, test } from "@playwright/test";
import { adminToken, apiCreateProject, loginAsAdminViaUi } from "./helpers/api";

test("the 10-stage tracker marks the project's currentStage as current", async ({ page }) => {
  const token = await adminToken();
  const projectName = `פרויקט שלבים ${Date.now()}`;
  // PLUMBING is the 3rd of 10 stages (index 2).
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "רעננה",
    currentStage: "PLUMBING",
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText("אינסטלציה");
  await expect(tracker).toContainText("3/10");
});

test("a project with no stage set shows no current stage", async ({ page }) => {
  const token = await adminToken();
  const projectName = `פרויקט ללא שלב ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "לוד" });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toContainText("טרם נקבע שלב");
});
