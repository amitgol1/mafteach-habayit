import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";
import { paceBcrypt } from "./helpers/api";
import { loadLiveEnv } from "./helpers/env";
import { loginAsQaAdminViaUi, reachTotpScreen } from "./helpers/ui";

const env = loadLiveEnv();

test.describe("QA admin authentication (UI)", () => {
  test("password + TOTP login lands on the dashboard; session survives reload; logout clears it", async ({ page }) => {
    await loginAsQaAdminViaUi(page);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "ניהול", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeTruthy();

    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page).toHaveURL("/login");
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logout while a request is still in flight does not resurrect the session", async ({ page }) => {
    await loginAsQaAdminViaUi(page);
    // Hold the dashboard's /api/projects response so it is certainly in flight at logout time.
    await page.route("**/api/projects", async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ response });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page).toHaveURL("/login");
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => localStorage.getItem("token") !== null)).toBe(false);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong password shows the Hebrew error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("אימייל").fill(env.LIVE_QA_ADMIN_EMAIL);
    await page.getByLabel("סיסמה").fill("definitely-wrong-password");
    await paceBcrypt();
    await page.getByRole("button", { name: "כניסה" }).click();
    await expect(page.getByText("אימייל או סיסמה שגויים")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong TOTP code is rejected, then the right code still logs in", async ({ page }) => {
    await reachTotpScreen(page, env.LIVE_QA_ADMIN_EMAIL, env.LIVE_QA_ADMIN_PASSWORD);
    await expect(page.getByText("אימות דו-שלבי", { exact: true })).toBeVisible();
    await expect(page.getByTestId("totp-qr-code")).toHaveCount(0);

    // Pick a code that is certainly not the current/adjacent one.
    const wrong = authenticator.generate(env.LIVE_QA_ADMIN_TOTP_SECRET) === "000000" ? "999999" : "000000";
    await page.getByTestId("totp-code-input").fill(wrong);
    await page.getByRole("button", { name: "כניסה" }).click();
    await expect(page.getByText("קוד שגוי, נסו שוב")).toBeVisible();

    await page.getByTestId("totp-code-input").fill(authenticator.generate(env.LIVE_QA_ADMIN_TOTP_SECRET));
    await page.getByRole("button", { name: "כניסה" }).click();
    await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  });
});
