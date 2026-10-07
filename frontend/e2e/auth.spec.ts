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

test("logout while a request is still in flight does not resurrect the session", async ({ page }) => {
  await loginAsAdminViaUi(page);
  // Hold the dashboard's /api/projects response so it lands after logout.
  await page.route("**/api/projects", async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ response });
  });
  await page.reload();
  await page.getByRole("button", { name: "התנתקות" }).click();
  await expect(page).toHaveURL("/login");
  await page.waitForTimeout(2500);

  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("a server error on login says so instead of blaming the credentials", async ({ page }) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 503, contentType: "text/html", body: "Worker exceeded resource limits" })
  );
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(ADMIN_EMAIL);
  await page.getByLabel("סיסמה").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("תקלה זמנית בשרת, נסו שוב בעוד רגע")).toBeVisible();
  await expect(page.getByText("אימייל או סיסמה שגויים")).toHaveCount(0);
});

test("a server error on the 2FA step keeps the user on it with a server-error message", async ({ page }) => {
  await page.route("**/api/auth/totp/verify", (route) =>
    route.fulfill({ status: 503, contentType: "text/html", body: "Worker exceeded resource limits" })
  );
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(ADMIN_EMAIL);
  await page.getByLabel("סיסמה").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.getByTestId("totp-code-input").fill("123456");
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("תקלה זמנית בשרת, נסו שוב בעוד רגע")).toBeVisible();
  await expect(page.getByTestId("totp-code-input")).toBeVisible();
});
