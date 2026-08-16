import { expect, test } from "@playwright/test";
import { adminToken, apiCreateProject, loginAsAdminViaUi } from "./helpers/api";

test("dashboard lists projects; clicking a card navigates to /projects/:id", async ({ page }) => {
  const token = await adminToken();
  const projectName = `פרויקט דשבורד ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "רמת גן" });

  await loginAsAdminViaUi(page);

  const heading = page.getByRole("heading", { name: projectName, level: 2 });
  await expect(heading).toBeVisible();

  await heading.click();
  await expect(page).toHaveURL(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();
});
