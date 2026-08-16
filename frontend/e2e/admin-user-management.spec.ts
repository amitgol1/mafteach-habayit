import { expect, test } from "@playwright/test";
import { adminToken, apiCreateUser, apiDeleteUser, loginAsAdminViaUi } from "./helpers/api";

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

  test("edits an existing user's role/trade", async ({ page }) => {
    const token = await adminToken();
    const email = `edit-target-${Date.now()}@e2e.test`;
    const user = await apiCreateUser(token, {
      name: `למחיקה בעריכה ${Date.now()}`,
      email,
      password: "password123",
      role: "COLLABORATOR",
      trade: "ELECTRICIAN",
    });

    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    const row = page.getByRole("listitem").filter({ hasText: email });
    await expect(row).toBeVisible();

    const newName = `שם מעודכן ${Date.now()}`;
    await row.getByRole("button", { name: "ערוך" }).click();
    await row.getByLabel("שם מלא (עריכה)").fill(newName);
    await row.getByLabel("הרשאת מערכת (עריכה)").selectOption({ label: "מנהל עבודה" });
    await row.getByLabel("תחום עיסוק (עריכה)").selectOption({ label: "אינסטלטור" });
    await row.getByRole("button", { name: "שמור שינויים" }).click();

    await expect(row.getByLabel("שם מלא (עריכה)")).not.toBeVisible();
    await expect(row).toContainText(newName);
    await expect(row).toContainText("מנהל עבודה");
    await expect(row).toContainText("אינסטלטור");

    await page.reload();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();
    const reloadedRow = page.getByRole("listitem").filter({ hasText: email });
    await expect(reloadedRow).toContainText(newName);
    await expect(reloadedRow).toContainText("מנהל עבודה");

    await apiDeleteUser(token, user.id);
  });

  test("deletes a user", async ({ page }) => {
    const token = await adminToken();
    const email = `delete-target-${Date.now()}@e2e.test`;
    await apiCreateUser(token, {
      name: `למחיקה ${Date.now()}`,
      email,
      password: "password123",
      role: "COLLABORATOR",
      trade: "PLUMBER",
    });

    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();

    const row = page.getByRole("listitem").filter({ hasText: email });
    await expect(row).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "מחק" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: email })).toHaveCount(0);
  });
});
