import { expect, test } from "@playwright/test";
import {
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateUnit,
  createEntrepreneur,
  loginAsAdminViaUi,
} from "./helpers/api";

test("posting a text update in a sub-phase feed shows it in the list", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט יומן ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "בת ים" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  const messageText = `עדכון בדיקה ${Date.now()}`;
  await page.getByPlaceholder("תיאור...").fill(messageText);
  await page.getByRole("button", { name: "שליחה" }).click();

  await expect(page.getByText(messageText)).toBeVisible();
});

test("posting an update with a subject shows both subject and description", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט יומן ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "בת ים" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  const subject = `נושא בדיקה ${Date.now()}`;
  const description = `תיאור בדיקה ${Date.now()}`;
  await page.getByPlaceholder("נושא").fill(subject);
  await page.getByPlaceholder("תיאור...").fill(description);
  await page.getByRole("button", { name: "שליחה" }).click();

  await expect(page.getByText(subject)).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
});

test("an update with media shows a download link pointing at the uploaded file", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט יומן ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "בת ים" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/test-image.png");
  await page.getByRole("button", { name: "שליחה" }).click();

  const downloadLink = page.getByRole("link", { name: "הורדה" });
  await expect(downloadLink).toBeVisible();
  const img = page.locator("article img").first();
  await expect(img).toBeVisible();
  const [imgSrc, href] = await Promise.all([img.getAttribute("src"), downloadLink.getAttribute("href")]);
  expect(href).toBe(imgSrc);
  expect(href).toMatch(/^\/uploads\//);
});
