import { expect, type Page } from "@playwright/test";
import { authenticator } from "otplib";
import { loadLiveEnv } from "./env";
import { logTransient, paceBcrypt, qaAdmin, type Session } from "./api";

const env = loadLiveEnv();

// Drives the real login -> TOTP screens. A fresh account sees the QR setup
// screen with the secret in the DOM (scraped here); a returning one needs
// `totpSecret`. Returns the secret used.
// Submits known-good credentials and waits for the TOTP screen. The live Worker intermittently
// answers /auth/login or /auth/totp/setup with Cloudflare 503 "exceeded resource limits"; the SPA
// renders that as a credentials/expired error, so retry (and log each retry as a finding).
export async function reachTotpScreen(page: Page, email: string, password: string): Promise<void> {
  const codeInput = page.getByTestId("totp-code-input");
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto("/login");
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await paceBcrypt();
    await page.getByRole("button", { name: "כניסה" }).click();
    const reached = await codeInput.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    if (reached) return;
    const shown = (await page.locator("form p, p.text-brick-deep").allInnerTexts().catch(() => [])).join(" | ").slice(0, 120);
    logTransient(`${new Date().toISOString()} UI login attempt ${attempt} for ${email} did not reach the TOTP screen; page text: ${shown}`);
    await page.waitForTimeout(5000 * attempt);
  }
  throw new Error(`could not reach the TOTP screen for ${email} after 4 attempts`);
}

// Drives the real login -> TOTP screens. A fresh account sees the QR setup
// screen with the secret in the DOM (scraped here); a returning one needs
// `totpSecret`. Returns the secret used.
export async function loginViaUi(page: Page, email: string, password: string, totpSecret?: string): Promise<string> {
  await reachTotpScreen(page, email, password);
  const codeInput = page.getByTestId("totp-code-input");
  const manual = page.getByTestId("totp-manual-secret");
  let secret: string;
  if ((await manual.count()) > 0) {
    secret = (await manual.innerText()).trim();
  } else {
    if (!totpSecret) throw new Error(`loginViaUi: ${email} shows the returning-user screen but no secret was given`);
    secret = totpSecret;
  }
  await codeInput.fill(authenticator.generate(secret));
  await page.getByRole("button", { name: /^(אישור והפעלה|כניסה)$/ }).click();
  await expect(page.getByRole("heading", { name: "הפרויקטים שלי" })).toBeVisible();
  return secret;
}

// Captures the session the app stored in localStorage after a UI login, so later tests can reuse
// it (useSession) instead of paying for another bcrypt login on the Worker.
export async function sessionFromPage(page: Page, totpSecret: string): Promise<Session> {
  const { token, user } = await page.evaluate(() => ({
    token: localStorage.getItem("token") as string,
    user: JSON.parse(localStorage.getItem("user") as string),
  }));
  return { token, user, totpSecret };
}

export async function loginAsQaAdminViaUi(page: Page): Promise<void> {
  await loginViaUi(page, env.LIVE_QA_ADMIN_EMAIL, env.LIVE_QA_ADMIN_PASSWORD, env.LIVE_QA_ADMIN_TOTP_SECRET);
}

// Seeds the browser with an already-authenticated API session (same
// localStorage keys the app's AuthContext uses), to avoid a UI login per test.
// The UI login flow itself is covered in 02-auth.spec.ts.
export async function useSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", user);
    },
    [session.token, JSON.stringify(session.user)] as const
  );
}

export async function useAdminSession(page: Page): Promise<void> {
  await useSession(page, await qaAdmin());
}

export async function openAdminUsers(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.getByRole("button", { name: "ניהול משתמשים" }).click();
  await expect(page.getByRole("heading", { name: "הוספת משתמש חדש" })).toBeVisible();
}

export function acceptNextDialog(page: Page): Promise<string> {
  return new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
}
