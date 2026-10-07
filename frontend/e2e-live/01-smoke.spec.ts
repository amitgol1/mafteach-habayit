import { expect, test } from "@playwright/test";
import { API, call } from "./helpers/api";

test.describe("read-only smoke", () => {
  test("GET /api/health returns ok", async () => {
    const r = await call(null, "GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: "ok" });
  });

  test("protected API routes return 401 without a token", async () => {
    for (const path of ["/projects", "/users", "/users/tree", "/projects/1/updates", "/projects/1/financials"]) {
      const r = await call(null, "GET", path);
      expect(r.status, path).toBe(401);
    }
    const post = await call(null, "POST", "/projects", { name: "x", location: "y" });
    expect(post.status).toBe(401);
  });

  test("garbage bearer token is rejected with 401", async () => {
    const r = await call("not-a-jwt", "GET", "/projects");
    expect(r.status).toBe(401);
  });

  test("login with wrong credentials returns 401, missing fields 400", async () => {
    const bad = await call(null, "POST", "/auth/login", { email: "nobody-qa@test.local", password: "wrong" });
    expect(bad.status).toBe(401);
    const missing = await call(null, "POST", "/auth/login", { email: "nobody-qa@test.local" });
    expect(missing.status).toBe(400);
  });

  test("unknown upload key returns 404", async ({ request }) => {
    const res = await request.get(`${API.replace(/\/api$/, "")}/uploads/qa-does-not-exist.png`);
    expect(res.status()).toBe(404);
  });

  test("/ without a session redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("אימייל")).toBeVisible();
  });

  test("/login renders the Hebrew RTL login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.getByLabel("אימייל")).toBeVisible();
    await expect(page.getByLabel("סיסמה")).toBeVisible();
    await expect(page.getByRole("button", { name: "כניסה" })).toBeVisible();
  });

  test("deep links serve the SPA (not a 404) and fall back to /login when logged out", async ({ page }) => {
    const res = await page.goto("/projects/999999999");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    const res2 = await page.goto("/admin");
    expect(res2?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    const res3 = await page.goto("/some/unknown/route");
    expect(res3?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("static assets referenced by the SPA load without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/assets/")) errors.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/login");
    await expect(page.getByLabel("אימייל")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
