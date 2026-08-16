import { expect, test } from "@playwright/test";
import { adminToken, apiCreateUser, apiDeleteUser, createEntrepreneur, loginAsAdminViaUi, loginViaUi } from "./helpers/api";

test.describe("SUPER_ADMIN user management", () => {
  test("creates an ENTREPRENEUR user (role is fixed, no trade field shown)", async ({ page }) => {
    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();
    await expect(page.getByRole("heading", { name: "הוספת משתמש חדש" })).toBeVisible();

    await expect(page.getByLabel("הרשאת מערכת")).toHaveValue("יזם");
    await expect(page.getByLabel("תחום עיסוק")).toHaveCount(0);

    const name = `יזם בדיקה ${Date.now()}`;
    await page.getByLabel("שם מלא").fill(name);
    await page.getByLabel("אימייל / שם משתמש").fill(`entrepreneur-ui-${Date.now()}@e2e.test`);
    await page.getByLabel("סיסמה").fill("password123");
    await page.getByRole("button", { name: "צור משתמש" }).click();

    await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();
  });

  test("edits an existing user's name/trade", async ({ page }) => {
    const entrepreneur = await createEntrepreneur();
    const email = `edit-target-${Date.now()}@e2e.test`;
    const user = await apiCreateUser(entrepreneur.token, {
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
    await row.getByLabel("תחום עיסוק (עריכה)").selectOption({ label: "אינסטלטור" });
    await row.getByRole("button", { name: "שמור שינויים" }).click();

    await expect(row.getByLabel("שם מלא (עריכה)")).not.toBeVisible();
    await expect(row).toContainText(newName);
    await expect(row).toContainText("אינסטלטור");

    await page.reload();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();
    const reloadedRow = page.getByRole("listitem").filter({ hasText: email });
    await expect(reloadedRow).toContainText(newName);
    await expect(reloadedRow).toContainText("אינסטלטור");

    const admin = await adminToken();
    await apiDeleteUser(admin, user.id);
  });

  test("deletes a user", async ({ page }) => {
    const entrepreneur = await createEntrepreneur();
    const email = `delete-target-${Date.now()}@e2e.test`;
    await apiCreateUser(entrepreneur.token, {
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

test.describe("ENTREPRENEUR user management", () => {
  test("creates a COLLABORATOR user with a trade (role is fixed) and it appears in a trade dropdown", async ({
    page,
  }) => {
    const entrepreneur = await createEntrepreneur();
    await loginViaUi(page, entrepreneur.email, "password123");
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await page.getByRole("button", { name: "ניהול משתמשים" }).click();
    await expect(page.getByRole("heading", { name: "הוספת משתמש חדש" })).toBeVisible();

    await expect(page.getByLabel("הרשאת מערכת")).toHaveValue("איש מקצוע");

    const name = `שרברב בדיקה ${Date.now()}`;
    await page.getByLabel("שם מלא").fill(name);
    await page.getByLabel("אימייל / שם משתמש").fill(`plumber-${Date.now()}@e2e.test`);
    await page.getByLabel("סיסמה").fill("password123");
    await page.getByLabel("תחום עיסוק").selectOption({ label: "אינסטלטור" });
    await page.getByRole("button", { name: "צור משתמש" }).click();

    await expect(page.getByText("המשתמש נוצר בהצלחה")).toBeVisible();

    await page.getByRole("button", { name: "יצירת פרויקט" }).click();
    await expect(page.getByLabel("אינסטלטור").locator(`option:has-text("${name}")`)).toHaveCount(1);
  });
});
