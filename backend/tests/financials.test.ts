import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

describe("/api/projects/:projectId/financials", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  // Regression guard: totalDue must come from project.totalBudget, not be
  // summed from per-record fields — FinancialRecord no longer has a totalDue column.
  it("totals.totalDue equals project.totalBudget, and recomputes after a payment", async () => {
    const project = await prisma.project.create({
      data: { name: "P", location: "L", totalBudget: 50000, entrepreneurId: entrepreneur.id },
    });

    const initialRes = await request(app)
      .get(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin));
    expect(initialRes.status).toBe(200);
    expect(initialRes.body.totals).toEqual({ totalDue: 50000, totalPaid: 0, remaining: 50000 });

    const payRes = await request(app)
      .post(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin))
      .send({ amountPaid: "12000" });
    expect(payRes.status).toBe(201);
    expect(payRes.body.amountPaid).toBe(12000);

    const afterRes = await request(app)
      .get(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin));
    expect(afterRes.status).toBe(200);
    expect(afterRes.body.totals).toEqual({ totalDue: 50000, totalPaid: 12000, remaining: 38000 });
  });

  it("does not require or persist a totalDue field on a financial record", async () => {
    const project = await prisma.project.create({
      data: { name: "P", location: "L", totalBudget: 1000, entrepreneurId: entrepreneur.id },
    });

    const res = await request(app)
      .post(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin))
      .send({ amountPaid: "500", totalDue: 999999 });

    expect(res.status).toBe(201);
    expect(res.body.totalDue).toBeUndefined();
  });

  it("DELETE /api/financial-records/:id removes a record and recomputes totals", async () => {
    const project = await prisma.project.create({
      data: { name: "P", location: "L", totalBudget: 1000, entrepreneurId: entrepreneur.id },
    });
    const created = await request(app)
      .post(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin))
      .send({ amountPaid: "500" });

    const deleteRes = await request(app)
      .delete(`/api/financial-records/${created.body.id}`)
      .set("Authorization", authHeader(admin));
    expect(deleteRes.status).toBe(204);

    const afterRes = await request(app)
      .get(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin));
    expect(afterRes.body.totals.totalPaid).toBe(0);
  });
});
