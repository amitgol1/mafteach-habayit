import { expect, test } from "@playwright/test";
import { apiGetProject, apiPatchUnit, createEntrepreneur, loginAsAdminViaUi } from "./helpers/api";

test("setting a project type on creation and generating units in sequence", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();

  await loginAsAdminViaUi(page);
  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();

  const projectName = `פרויקט בתים ${Date.now()}`;
  await page.getByLabel("יזם", { exact: true }).selectOption({ label: entrepreneur.name });
  await page.getByLabel("שם הפרויקט").fill(projectName);
  await page.getByLabel("מיקום").fill("רעננה");
  await page.getByLabel("סוג פרויקט").selectOption({ label: "בתים פרטיים" });
  await page.getByRole("button", { name: "צור פרויקט" }).click();
  await expect(page.getByText("הפרויקט נוצר בהצלחה")).toBeVisible();

  await page.getByRole("link", { name: "מפתח הבית" }).click();
  await page.getByRole("heading", { name: projectName, level: 2 }).click();
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  const projectId = Number(page.url().match(/\/projects\/(\d+)/)?.[1]);
  expect(projectId).toBeGreaterThan(0);

  const tree = page.getByTestId("project-tree");

  // Generate the first two units — numbering starts at 1 since the project has none yet.
  await page.getByRole("button", { name: "+ יצירת יחידות אוטומטית" }).click();
  await page.getByLabel("מספר יחידות").fill("2");
  await page.getByRole("button", { name: "יצירה" }).click();

  await expect(tree.getByRole("heading", { name: "בית 1", level: 3 })).toBeVisible();
  await expect(tree.getByRole("heading", { name: "בית 2", level: 3 })).toBeVisible();

  // Generate one more — numbering must continue from the current unit count (3), not restart.
  await page.getByRole("button", { name: "+ יצירת יחידות אוטומטית" }).click();
  await page.getByLabel("מספר יחידות").fill("1");
  await page.getByRole("button", { name: "יצירה" }).click();

  await expect(tree.getByRole("heading", { name: "בית 3", level: 3 })).toBeVisible();

  await page.reload();
  await expect(tree.getByRole("heading", { name: "בית 1", level: 3 })).toBeVisible();
  await expect(tree.getByRole("heading", { name: "בית 2", level: 3 })).toBeVisible();
  await expect(tree.getByRole("heading", { name: "בית 3", level: 3 })).toBeVisible();

  // Generated unit names stay free-text/editable afterward. The app has no
  // in-UI rename affordance for units (only PATCH /units/:id on the API), so
  // this exercises that endpoint directly and confirms the UI reflects it.
  const project = await apiGetProject(entrepreneur.token, projectId);
  const generatedUnit = project.units.find((u) => u.identifier === "בית 2");
  expect(generatedUnit).toBeTruthy();
  const renamedName = `בית הצפון ${Date.now()}`;
  await apiPatchUnit(entrepreneur.token, generatedUnit!.id, renamedName);

  await page.reload();
  await expect(tree.getByRole("heading", { name: renamedName, level: 3 })).toBeVisible();
  await expect(tree.getByRole("heading", { name: "בית 2", level: 3 })).not.toBeVisible();
});
