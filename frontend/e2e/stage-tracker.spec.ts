import { expect, test } from "@playwright/test";
import { apiCreateProject, createEntrepreneur, loginAsAdminViaUi } from "./helpers/api";

test("the 10-stage tracker marks the project's currentStage as current", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט שלבים ${Date.now()}`;
  // PLUMBING is the 3rd of 10 stages (index 2).
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "רעננה",
    currentStage: "PLUMBING",
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText("אינסטלציה");
  await expect(tracker).toContainText("3/10");
});

test("a project with no stage set shows no current stage", async ({ page }) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט ללא שלב ${Date.now()}`;
  const project = await apiCreateProject(token, { name: projectName, location: "לוד" });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  const tracker = page.locator('section[aria-label="שלב הפרויקט"]');
  await expect(tracker).toContainText("טרם נקבע שלב");
});

test("on a phone viewport, the tracker is collapsed to the current stage and expands on tap", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const { token } = await createEntrepreneur();
  const projectName = `פרויקט טלפון ${Date.now()}`;
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "לוד",
    currentStage: "PLUMBING",
  });

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);

  // Scoped to the phone-only container: the desktop tracker is also in the DOM
  // (just CSS-hidden below the sm breakpoint), so an unscoped text search would
  // false-match its always-rendered full stage list.
  const mobileTracker = page.getByTestId("stage-tracker-mobile");
  const toggle = mobileTracker.getByRole("button");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("אינסטלציה");

  // Collapsed: only the current stage shows, the rest of the sequence is not rendered.
  await expect(mobileTracker.getByText("שלד", { exact: true })).toHaveCount(0);
  await expect(mobileTracker.getByText("טופס 4", { exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(mobileTracker.getByText("שלד", { exact: true })).toBeVisible();
  await expect(mobileTracker.getByText("טופס 4", { exact: true })).toBeVisible();
  // Regression: the current stage must appear exactly once, not once in the
  // toggle and again in the expanded list.
  await expect(mobileTracker.getByText("אינסטלציה", { exact: true })).toHaveCount(1);

  await toggle.click();
  await expect(mobileTracker.getByText("שלד", { exact: true })).toHaveCount(0);
});
