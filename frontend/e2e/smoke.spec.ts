import { expect, test } from "@playwright/test";

test("login redirects to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill("admin@mafteach-habayit.local");
  await page.getByLabel("סיסמה").fill("admin123");
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
});
