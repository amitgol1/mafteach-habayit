import { expect, test } from "@playwright/test";
import {
  apiAssignSubPhase,
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateUnit,
  apiCreateUser,
  createEntrepreneur,
  loginAsAdminViaUi,
  loginViaUi,
} from "./helpers/api";

test("a manager builds a unit, phase and sub-phase through the UI and progresses their status", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט מבנה ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "חדרה" });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  await expect(page.getByText("אין יחידות עדיין")).toBeVisible();

  const unitName = `יחידה חדשה ${Date.now()}`;
  await page.getByRole("button", { name: "+ הוספת יחידה" }).click();
  await page.getByLabel("מזהה יחידה").fill(unitName);
  await page.getByRole("button", { name: "הוספה" }).click();

  await expect(page.getByRole("heading", { name: unitName, level: 3 })).toBeVisible();
  await expect(page.getByText("אין יחידות עדיין")).not.toBeVisible();

  // Scoped to the tree: the always-rendered desktop stage tracker also
  // contains "שלד" as one of its 10 static stage labels.
  const tree = page.getByTestId("project-tree");

  await page.getByRole("button", { name: "+ הוספת שלב" }).click();
  await page.getByLabel("שלב", { exact: true }).selectOption({ label: "שלד" });
  await page.getByRole("button", { name: "הוספה" }).click();

  await expect(tree.getByText("שלד", { exact: true })).toBeVisible();
  const phaseStatusSelect = page.getByLabel("סטטוס שלב: שלד");
  await expect(phaseStatusSelect).toHaveValue("NOT_STARTED");

  await expect(page.getByText("אין תת-שלבים")).toBeVisible();

  const subPhaseName = `יציקת יסודות ${Date.now()}`;
  await page.getByRole("button", { name: "+ הוספת תת-שלב" }).click();
  await page.getByLabel("שם תת-השלב").fill(subPhaseName);
  await page.getByRole("button", { name: "הוספה" }).click();

  await expect(tree.getByText(subPhaseName, { exact: true })).toBeVisible();
  const subPhaseStatusSelect = page.getByLabel(`סטטוס תת-שלב: ${subPhaseName}`);
  await expect(subPhaseStatusSelect).toHaveValue("NOT_STARTED");

  await phaseStatusSelect.selectOption({ label: "בביצוע" });
  await expect(phaseStatusSelect).toHaveValue("IN_PROGRESS");

  await subPhaseStatusSelect.selectOption({ label: "הושלם" });
  await expect(subPhaseStatusSelect).toHaveValue("COMPLETED");

  await page.reload();
  await expect(page.getByLabel("סטטוס שלב: שלד")).toHaveValue("IN_PROGRESS");
  await expect(page.getByLabel(`סטטוס תת-שלב: ${subPhaseName}`)).toHaveValue("COMPLETED");
});

test("a collaborator sees the project tree read-only, with no add-forms or status selects", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט צפייה בלבד ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "עפולה" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");
  const otherSubPhase = await apiCreateSubPhase(token, phase.id, "קירות");

  const email = `collab-tree-${Date.now()}@e2e.test`;
  const password = "password123";
  const collaborator = await apiCreateUser(token, {
    name: "איש מקצוע לצפייה",
    email,
    password,
    role: "COLLABORATOR",
    trade: "MAIN_CONTRACTOR",
  });
  await apiAssignSubPhase(token, subPhase.id, collaborator.id);

  await loginViaUi(page, email, password);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  await expect(page.getByRole("heading", { name: "יחידה 1", level: 3 })).toBeVisible();
  await expect(page.getByText(subPhase.name, { exact: true })).toBeVisible();
  // Assigned to only one sub-phase, but the whole project tree is visible.
  await expect(page.getByText(otherSubPhase.name, { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "+ הוספת יחידה" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ הוספת שלב" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ הוספת תת-שלב" })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
