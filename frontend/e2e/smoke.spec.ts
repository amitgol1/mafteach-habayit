import { expect, test } from "@playwright/test";
import { loginAsAdminViaUi } from "./helpers/api";

test("login redirects to dashboard", async ({ page }) => {
  await loginAsAdminViaUi(page);

  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
});
