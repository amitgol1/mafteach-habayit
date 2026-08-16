import { expect, test } from "@playwright/test";
import { adminToken, apiCreateProject, loginAsAdminViaUi } from "./helpers/api";

// Counterpart to a backend fix: totalDue must come from the project's own
// totalBudget, not some other value. Using an unusual budget number makes a
// mix-up with another figure (e.g. a stray default or another project) obvious.
const BUDGET = 87650;

test("total due matches the project's budget; adding a payment updates totals live", async ({ page }) => {
  const token = await adminToken();
  const projectName = `פרויקט כספים ${Date.now()}`;
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "אשדוד",
    totalBudget: BUDGET,
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("button", { name: "כספים" }).click();

  function totalsValue(label: string) {
    return page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  }

  const totalDue = totalsValue("סה״כ לתשלום");
  const paid = totalsValue("שולם");
  const remaining = totalsValue("יתרה לתשלום");

  await expect(totalDue).toContainText("87,650");
  await expect(paid).toContainText("0");
  await expect(remaining).toContainText("87,650");

  await page.getByLabel("סכום ששולם").fill("20000");
  await page.getByRole("button", { name: "הוספת תשלום" }).click();

  await expect(totalDue).toContainText("87,650");
  await expect(paid).toContainText("20,000");
  await expect(remaining).toContainText("67,650");
});
