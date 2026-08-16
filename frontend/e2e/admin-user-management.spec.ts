import { expect, test } from "@playwright/test";
import { loginAsAdminViaUi } from "./helpers/api";

test.describe("admin user management", () => {
  test("creates a COLLABORATOR user with a trade and it appears in a trade dropdown", async ({ page }) => {
    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();
    await expect(page.getByRole("heading", { name: "הוספת משתמש חדש" })).toBeVisible();

    const name = `שרברב בדיקה ${Date.now()}`;
    await page.getByLabel("שם מלא").fill(name);
    await page.getByLabel("אימייל / שם משתמש").fill(`plumber-${Date.now()}@e2e.test`);
    await page.getByLabel("סיסמה").fill("password123");
    await page.getByLabel("הרשאת מערכת").selectOption({ label: "איש מקצוע" });
    await page.getByLabel("תחום עיסוק").selectOption({ label: "אינסטלטור" });
    await page.getByRole("button", { name: "צור משתמש" }).click();

    await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();

    await page.getByRole("button", { name: "יצירת פרויקט" }).click();
    await expect(page.getByLabel("אינסטלטור").locator(`option:has-text("${name}")`)).toHaveCount(1);
  });

  test("creates an ADMIN user (no trade required)", async ({ page }) => {
    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    const name = `מנהל עבודה בדיקה ${Date.now()}`;
    await page.getByLabel("שם מלא").fill(name);
    await page.getByLabel("אימייל / שם משתמש").fill(`admin-${Date.now()}@e2e.test`);
    await page.getByLabel("סיסמה").fill("password123");
    await page.getByLabel("הרשאת מערכת").selectOption({ label: "מנהל עבודה" });
    await page.getByRole("button", { name: "צור משתמש" }).click();

    await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();
  });

  // No UI exists to list, edit, or delete users — UserManagementForm.tsx only
  // supports creating a user, even though the backend exposes PATCH/DELETE
  // /users/:id. Flagged to team-lead/be-developer: these two scenarios need a
  // user list + edit/delete UI before they can be exercised through the app.
  test.fixme("edits an existing user's role/trade", async () => {});
  test.fixme("deletes a user", async () => {});
});
