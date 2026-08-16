import { expect, test } from "@playwright/test";
import {
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateUnit,
  apiCreateUser,
  createEntrepreneur,
  loginAsAdminViaUi,
  loginViaUi,
} from "./helpers/api";

test("project-level updates tab is independent from a sub-phase's feed", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט עדכונים ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "גבעתיים" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  const projectMessage = `עדכון פרויקט ${Date.now()}`;
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();
  await page.getByPlaceholder("תיאור...").fill(projectMessage);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(projectMessage)).toBeVisible();

  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();
  await expect(page.getByText(projectMessage)).not.toBeVisible();

  const subPhaseMessage = `עדכון תת-שלב ${Date.now()}`;
  await page.getByPlaceholder("תיאור...").fill(subPhaseMessage);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(subPhaseMessage)).toBeVisible();

  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByText(projectMessage)).toBeVisible();
  await expect(page.getByText(subPhaseMessage)).not.toBeVisible();
});

test("a collaborator assigned as a project participant can view and post project-level updates", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  const email = `updates-collab-${Date.now()}@e2e.test`;
  const password = "password123";
  const collaborator = await apiCreateUser(entrepreneur.token, {
    name: "שרברב עדכונים",
    email,
    password,
    role: "COLLABORATOR",
    trade: "PLUMBER",
  });

  const projectName = `פרויקט עדכונים משתף ${Date.now()}`;
  const project = await apiCreateProject(entrepreneur.token, {
    name: projectName,
    location: "רחובות",
    participants: [{ trade: "PLUMBER", userId: collaborator.id }],
  });

  await loginViaUi(page, email, password);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  await expect(page.getByRole("button", { name: "כספים" })).toHaveCount(0);

  const message = `עדכון שיתופי ${Date.now()}`;
  await page.getByPlaceholder("תיאור...").fill(message);
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(message)).toBeVisible();
});
