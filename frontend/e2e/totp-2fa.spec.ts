import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiCreateUser,
  createEntrepreneur,
  loginAsAdminViaUi,
  loginViaUi,
} from "./helpers/api";

test("first login for a fresh account shows the QR setup screen, and a correct code logs in", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  const email = `totp-setup-${Date.now()}@e2e.test`;
  const password = "password123";
  await apiCreateUser(entrepreneur.token, {
    name: "משתמש הגדרה ראשונית",
    email,
    password,
    role: "COLLABORATOR",
    trade: "ELECTRICIAN",
  });

  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("הגדרת אימות דו-שלבי", { exact: true })).toBeVisible();
  await expect(page.getByTestId("totp-qr-code")).toBeVisible();
  const secret = (await page.getByTestId("totp-manual-secret").innerText()).trim();
  expect(secret.length).toBeGreaterThan(0);

  const code = authenticator.generate(secret);
  await page.getByTestId("totp-code-input").fill(code);
  await page.getByRole("button", { name: "אישור והפעלה" }).click();

  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
});

test("returning user with TOTP already configured sees a code-only screen (no QR) and logs in with a correct code", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(ADMIN_EMAIL);
  await page.getByLabel("סיסמה").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("אימות דו-שלבי", { exact: true })).toBeVisible();
  await expect(page.getByTestId("totp-qr-code")).toHaveCount(0);
  await expect(page.getByTestId("totp-manual-secret")).toHaveCount(0);

  await loginAsAdminViaUi(page);
});

test("a wrong TOTP code is rejected with an error, and a correct code afterwards still succeeds", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(ADMIN_EMAIL);
  await page.getByLabel("סיסמה").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("אימות דו-שלבי", { exact: true })).toBeVisible();
  await page.getByTestId("totp-code-input").fill("000000");
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("קוד שגוי, נסו שוב")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  const code = authenticator.generate("JBSWY3DPEHPK3PXP");
  await page.getByTestId("totp-code-input").fill(code);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
});

test("admin resetting a user's 2FA forces the QR setup screen again on that user's next login", async ({ page }) => {
  const entrepreneur = await createEntrepreneur();
  const email = `totp-reset-${Date.now()}@e2e.test`;
  const password = "password123";
  await apiCreateUser(entrepreneur.token, {
    name: "משתמש לאיפוס אימות",
    email,
    password,
    role: "COLLABORATOR",
    trade: "PLUMBER",
  });

  // Confirm TOTP for this account once, via the real UI setup flow.
  await loginViaUi(page, email, password);
  await page.getByRole("button", { name: "התנתקות" }).click();
  await expect(page).toHaveURL("/login");

  // Logging in again now shows the code-only screen (no QR) — 2FA is live.
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByText("אימות דו-שלבי", { exact: true })).toBeVisible();
  await expect(page.getByTestId("totp-qr-code")).toHaveCount(0);
  await page.goto("/login");

  await loginAsAdminViaUi(page);
  await page.getByRole("link", { name: "ניהול", exact: true }).click();
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();

  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "איפוס אימות דו-שלבי" }).click();

  await page.getByRole("button", { name: "התנתקות" }).click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();

  await expect(page.getByText("הגדרת אימות דו-שלבי", { exact: true })).toBeVisible();
  await expect(page.getByTestId("totp-qr-code")).toBeVisible();
});
