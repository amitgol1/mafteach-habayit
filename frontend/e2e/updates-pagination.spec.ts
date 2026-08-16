import { expect, test } from "@playwright/test";
import {
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateSubPhaseUpdate,
  apiCreateUnit,
  createEntrepreneur,
  loginAsAdminViaUi,
} from "./helpers/api";

test("the feed paginates with a load-more control once there are more than a page of updates", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט דפדוף ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "חיפה" });
  const unit = await apiCreateUnit(token, project.id, "יחידה 1");
  const phase = await apiCreatePhase(token, unit.id, "SKELETON", 1);
  const subPhase = await apiCreateSubPhase(token, phase.id, "יציקת יסודות");

  const runId = Date.now();
  const descriptionFor = (n: number) => `עדכון דפדוף ${runId} מספר ${n}`;

  // 11 updates: the default page size is 10, so this forces a second page.
  for (let i = 1; i <= 11; i++) {
    // eslint-disable-next-line no-await-in-loop
    await apiCreateSubPhaseUpdate(token, subPhase.id, { description: descriptionFor(i) });
  }

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await page.getByText(subPhase.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: "יומן עדכונים" })).toBeVisible();

  // Newest-first: updates 11..2 are on the first page, update 1 is not yet loaded.
  // exact:true avoids "מספר 1" matching as a substring of "מספר 11".
  await expect(page.getByText(descriptionFor(11), { exact: true })).toBeVisible();
  await expect(page.getByText(descriptionFor(2), { exact: true })).toBeVisible();
  await expect(page.getByText(descriptionFor(1), { exact: true })).not.toBeVisible();

  const loadMore = page.getByRole("button", { name: "טען עוד" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();

  await expect(page.getByText(descriptionFor(1), { exact: true })).toBeVisible();
  // Second page exhausts the remaining updates, so the control disappears.
  await expect(page.getByRole("button", { name: "טען עוד" })).toHaveCount(0);
});
