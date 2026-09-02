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

  describe("unit/phase/sub-phase linkage", () => {
    async function createProjectTree(entrepreneurId: number) {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", totalBudget: 1000, entrepreneurId },
      });
      const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
      const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
      return { project, unit, phase, subPhase };
    }

    it("persists a unit-only payment", async () => {
      const { project, unit } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", unitId: String(unit.id) });
      expect(res.status).toBe(201);
      expect(res.body.unitId).toBe(unit.id);
      expect(res.body.phaseId).toBeNull();
      expect(res.body.subPhaseId).toBeNull();
    });

    it("persists a phase-only payment", async () => {
      const { project, phase } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", phaseId: String(phase.id) });
      expect(res.status).toBe(201);
      expect(res.body.unitId).toBeNull();
      expect(res.body.phaseId).toBe(phase.id);
      expect(res.body.subPhaseId).toBeNull();
    });

    it("persists a sub-phase-only payment", async () => {
      const { project, subPhase } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", subPhaseId: String(subPhase.id) });
      expect(res.status).toBe(201);
      expect(res.body.unitId).toBeNull();
      expect(res.body.phaseId).toBeNull();
      expect(res.body.subPhaseId).toBe(subPhase.id);
    });

    it("persists a project-level payment when none of the three is set", async () => {
      const { project } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100" });
      expect(res.status).toBe(201);
      expect(res.body.unitId).toBeNull();
      expect(res.body.phaseId).toBeNull();
      expect(res.body.subPhaseId).toBeNull();
    });

    it("rejects more than one of unitId/phaseId/subPhaseId being set", async () => {
      const { project, unit, phase } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", unitId: String(unit.id), phaseId: String(phase.id) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("at most one of unitId, phaseId, or subPhaseId may be set");
    });

    it("rejects a malformed unitId", async () => {
      const { project } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", unitId: "abc" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("unitId must be a number");
    });

    it("rejects a phaseId that belongs to a different project", async () => {
      const { project: projectA } = await createProjectTree(entrepreneur.id);
      const { phase: phaseB } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${projectA.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", phaseId: String(phaseB.id) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("phaseId does not belong to this project");
    });

    it("rejects a subPhaseId that belongs to a different project", async () => {
      const { project: projectA } = await createProjectTree(entrepreneur.id);
      const { subPhase: subPhaseB } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${projectA.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", subPhaseId: String(subPhaseB.id) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("subPhaseId does not belong to this project");
    });

    it("rejects a unitId that belongs to a different project", async () => {
      const { project: projectA } = await createProjectTree(entrepreneur.id);
      const { unit: unitB } = await createProjectTree(entrepreneur.id);
      const res = await request(app)
        .post(`/api/projects/${projectA.id}/financials`)
        .set("Authorization", authHeader(admin))
        .send({ amountPaid: "100", unitId: String(unitB.id) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("unitId does not belong to this project");
    });
  });
});
