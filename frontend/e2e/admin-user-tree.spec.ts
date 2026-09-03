import { expect, test } from "@playwright/test";
import { apiCreateUser, createEntrepreneur, loginAsAdminViaUi, loginViaUi } from "./helpers/api";

test.describe("SUPER_ADMIN user tree", () => {
  test("shows entrepreneurs as top-level nodes with their collaborators nested underneath", async ({ page }) => {
    const entrepreneur = await createEntrepreneur();
    const collaboratorName = `איש מקצוע בעץ ${Date.now()}`;
    const collaboratorEmail = `tree-collab-${Date.now()}@e2e.test`;
    await apiCreateUser(entrepreneur.token, {
      name: collaboratorName,
      email: collaboratorEmail,
      password: "password123",
      role: "COLLABORATOR",
      trade: "ELECTRICIAN",
    });

    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    const tree = page.getByTestId("user-tree");
    await expect(tree).toBeVisible();

    const entrepreneurNode = tree.locator("> div").filter({ hasText: entrepreneur.email });
    await expect(entrepreneurNode).toBeVisible();
    await expect(entrepreneurNode).toContainText(entrepreneur.name);

    const collaboratorRow = entrepreneurNode.getByRole("listitem").filter({ hasText: collaboratorEmail });
    await expect(collaboratorRow).toBeVisible();
    await expect(collaboratorRow).toContainText(collaboratorName);
  });

  test("shows an entrepreneur with no collaborators with an empty state, not hidden", async ({ page }) => {
    const entrepreneur = await createEntrepreneur();

    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    const tree = page.getByTestId("user-tree");
    const entrepreneurNode = tree.locator("> div").filter({ hasText: entrepreneur.email });
    await expect(entrepreneurNode).toBeVisible();
    await expect(entrepreneurNode).toContainText("אין אנשי מקצוע משויכים עדיין");
  });

  test("non-SUPER_ADMIN roles keep the existing flat user list, not the tree", async ({ page }) => {
    const entrepreneur = await createEntrepreneur();

    await loginViaUi(page, entrepreneur.email, "password123", entrepreneur.totpSecret);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    await expect(page.getByTestId("user-list-flat")).toBeVisible();
    await expect(page.getByTestId("user-tree")).toHaveCount(0);
  });
});
