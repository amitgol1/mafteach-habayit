import { expect, test } from "@playwright/test";
import { adminToken, apiCreateUser, loginAsAdminViaUi } from "./helpers/api";

test.describe("admin project creation", () => {
  let architectName: string;

  test.beforeAll(async () => {
    const token = await adminToken();
    architectName = `אדריכלית בדיקה ${Date.now()}`;
    await apiCreateUser(token, {
      name: architectName,
      email: `architect-${Date.now()}@e2e.test`,
      password: "password123",
      role: "COLLABORATOR",
      trade: "ARCHITECT",
    });
  });

  test("filling and submitting the form creates a project", async ({ page }) => {
    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();

    const projectName = `פרויקט חדש ${Date.now()}`;
    await page.getByLabel("שם הפרויקט").fill(projectName);
    await page.getByLabel("מיקום").fill("הרצליה");
    await page.getByLabel("לקוחות / יזמים").fill("דנה ויוסי כהן");
    await page.getByLabel("תקציב כולל").fill("750000");
    await page.getByLabel("שלב נוכחי").selectOption({ label: "שלד" });
    await page.getByLabel("אדריכל").selectOption({ label: architectName });

    await page.getByRole("button", { name: "צור פרויקט" }).click();

    await expect(page.getByText("הפרויקט נוצר בהצלחה")).toBeVisible();

    await page.getByRole("link", { name: "מפתח הבית" }).click();
    await expect(page.getByRole("heading", { name: projectName, level: 2 })).toBeVisible();
  });

  test("submitting with a required field empty shows a validation error and does not submit", async ({ page }) => {
    await loginAsAdminViaUi(page);
    await page.getByRole("link", { name: "ניהול", exact: true }).click();
    await expect(page.getByRole("heading", { name: "יצירת פרויקט חדש" })).toBeVisible();

    await page.getByLabel("מיקום").fill("חיפה");
    await page.getByRole("button", { name: "צור פרויקט" }).click();

    await expect(page.locator("#name:invalid")).toHaveCount(1);
    await expect(page.getByText("הפרויקט נוצר בהצלחה")).not.toBeVisible();
    await expect(page).toHaveURL("/admin");
  });
});
