import { expect, test } from "@playwright/test";
import {
  adminToken,
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateUnit,
  loginAsAdminViaUi,
} from "./helpers/api";

test("posting a text update in a sub-phase feed shows it in the list", async ({ page }) => {
  const token = await adminToken();
  const projectName = `פרויקט יומן ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "בת ים" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "שלד", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  const messageText = `עדכון בדיקה ${Date.now()}`;
  await page.getByPlaceholder("כתבו עדכון...").fill(messageText);
  await page.getByRole("button", { name: "שליחה" }).click();

  await expect(page.getByText(messageText)).toBeVisible();
});
