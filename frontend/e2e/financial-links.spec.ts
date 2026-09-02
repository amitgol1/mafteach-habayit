import { expect, test } from "@playwright/test";
import {
  apiCreatePhase,
  apiCreateProject,
  apiCreateSubPhase,
  apiCreateUnit,
  createEntrepreneur,
  loginAsAdminViaUi,
} from "./helpers/api";

test("linking a payment to a unit / phase / sub-phase displays the link and rolls up into the breakdown", async ({
  page,
}) => {
  const { token } = await createEntrepreneur();
  const projectName = `פרויקט קישורים ${Date.now()}`;
  const project = await apiCreateProject(token, {
    name: projectName,
    location: "חיפה",
    totalBudget: 100000,
  });

  const unit1 = await apiCreateUnit(token, project.id, "בית 1");
  const unit2 = await apiCreateUnit(token, project.id, "בית 2");
  const phase1 = await apiCreatePhase(token, unit1.id, "SKELETON", 1);
  const subPhase1 = await apiCreateSubPhase(token, phase1.id, "מרתף");
  await apiCreatePhase(token, unit2.id, "ELECTRICITY", 1);

  await loginAsAdminViaUi(page);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("button", { name: "כספים" }).click();

  async function addPayment(
    amount: string,
    link?: { unit?: string; phase?: string; subPhase?: string }
  ) {
    await page.getByLabel("סכום ששולם").fill(amount);
    if (link?.unit) {
      await page.getByLabel("יחידה", { exact: true }).selectOption({ label: link.unit });
    }
    if (link?.phase) {
      await page.getByLabel("שלב", { exact: true }).selectOption({ label: link.phase });
    }
    if (link?.subPhase) {
      await page.getByLabel("תת-שלב", { exact: true }).selectOption({ label: link.subPhase });
    }
    await page.getByRole("button", { name: "הוספת תשלום" }).click();
  }

  const records = page.getByTestId("financial-record");

  // Unit-only link.
  await addPayment("1000", { unit: unit1.identifier });
  await expect(records).toHaveCount(1);
  await expect(records.filter({ hasText: "1,000" })).toContainText(unit1.identifier);

  // Unit + phase link.
  await addPayment("2000", { unit: unit1.identifier, phase: "שלד" });
  await expect(records).toHaveCount(2);
  await expect(records.filter({ hasText: "2,000" })).toContainText(`${unit1.identifier} › שלד`);

  // Unit + phase + sub-phase link.
  await addPayment("3000", { unit: unit1.identifier, phase: "שלד", subPhase: subPhase1.name });
  await expect(records).toHaveCount(3);
  await expect(records.filter({ hasText: "3,000" })).toContainText(`${unit1.identifier} › שלד › ${subPhase1.name}`);

  // General (no link).
  await addPayment("500");
  await expect(records).toHaveCount(4);
  const generalRecord = records.filter({ hasText: "500" }).filter({ hasNotText: "5,000" });
  await expect(generalRecord).not.toContainText(unit1.identifier);

  // Second unit, unit-only link.
  await addPayment("700", { unit: unit2.identifier });
  await expect(records).toHaveCount(5);

  const breakdown = page.getByTestId("financial-breakdown");
  const unitBlocks = breakdown.getByTestId("unit-breakdown");

  const unit1Block = unitBlocks.filter({ hasText: unit1.identifier });
  await expect(unit1Block).toContainText("6,000"); // 1,000 + 2,000 + 3,000
  const unit1Phase = unit1Block.getByTestId("phase-breakdown");
  await expect(unit1Phase).toContainText("שלד");
  await expect(unit1Phase).toContainText("5,000"); // 2,000 + 3,000

  const unit2Block = unitBlocks.filter({ hasText: unit2.identifier });
  await expect(unit2Block).toContainText("700");
  await expect(unit2Block.getByTestId("phase-breakdown")).toHaveCount(0);

  await expect(breakdown.getByTestId("general-breakdown")).toContainText("500");
});
