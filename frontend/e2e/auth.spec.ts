import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdminViaUi } from "./helpers/api";

test("valid login redirects to dashboard", async ({ page }) => {
  await loginAsAdminViaUi(page);
  await expect(page).toHaveURL("/");
});

test("invalid credentials show a Hebrew error and stay on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(ADMIN_EMAIL);
  await page.getByLabel("סיסמה").fill("wrong-password");
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("אימייל או סיסמה שגויים")).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("logged-in state persists across a page reload", async ({ page }) => {
  await loginAsAdminViaUi(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
});

test("logout clears session and redirects to /login", async ({ page }) => {
  await loginAsAdminViaUi(page);
  await page.getByRole("button", { name: "התנתקות" }).click();

  await expect(page).toHaveURL("/login");
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeNull();
});
