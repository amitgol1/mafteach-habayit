import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

describe("units/phases/sub-phases", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  describe("/api/units", () => {
    it("admin can create, update, and delete a unit", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const createRes = await request(app)
        .post("/api/units")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifier: "House A" });
      expect(createRes.status).toBe(201);
      const unitId = createRes.body.id;

      const patchRes = await request(app)
        .patch(`/api/units/${unitId}`)
        .set("Authorization", authHeader(admin))
        .send({ identifier: "House B" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.identifier).toBe("House B");

      const deleteRes = await request(app).delete(`/api/units/${unitId}`).set("Authorization", authHeader(admin));
      expect(deleteRes.status).toBe(204);
    });

    it("blocks a COLLABORATOR from creating a unit", async () => {
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });

      const res = await request(app)
        .post("/api/units")
        .set("Authorization", authHeader(collaborator))
        .send({ projectId: project.id, identifier: "House A" });
      expect(res.status).toBe(403);
    });

    it("blocks an ENTREPRENEUR from creating a unit on a project they do not own", async () => {
      const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units")
        .set("Authorization", authHeader(otherEntrepreneur))
        .send({ projectId: project.id, identifier: "House A" });
      expect(res.status).toBe(403);
    });

    it("allows the owning ENTREPRENEUR to create a unit", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units")
        .set("Authorization", authHeader(entrepreneur))
        .send({ projectId: project.id, identifier: "House A" });
      expect(res.status).toBe(201);
    });
  });

  describe("/api/phases", () => {
    it("admin can create, update, and delete a phase", async () => {
      const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
      const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });

      const createRes = await request(app)
        .post("/api/phases")
        .set("Authorization", authHeader(admin))
        .send({ unitId: unit.id, name: "Skeleton", order: 1 });
      expect(createRes.status).toBe(201);
      const phaseId = createRes.body.id;

      const patchRes = await request(app)
        .patch(`/api/phases/${phaseId}`)
        .set("Authorization", authHeader(admin))
        .send({ status: "IN_PROGRESS" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.status).toBe("IN_PROGRESS");

      const deleteRes = await request(app).delete(`/api/phases/${phaseId}`).set("Authorization", authHeader(admin));
      expect(deleteRes.status).toBe(204);
    });

    it("blocks a COLLABORATOR from creating a phase", async () => {
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
      const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });

      const res = await request(app)
        .post("/api/phases")
        .set("Authorization", authHeader(collaborator))
        .send({ unitId: unit.id, name: "Skeleton", order: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe("/api/sub-phases", () => {
    async function buildHierarchy() {
      const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
      const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
      const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
      return { project, unit, phase };
    }

    it("admin can create, update, and delete a sub-phase", async () => {
      const { phase } = await buildHierarchy();

      const createRes = await request(app)
        .post("/api/sub-phases")
        .set("Authorization", authHeader(admin))
        .send({ phaseId: phase.id, name: "Underground" });
      expect(createRes.status).toBe(201);
      const subPhaseId = createRes.body.id;

      const patchRes = await request(app)
        .patch(`/api/sub-phases/${subPhaseId}`)
        .set("Authorization", authHeader(admin))
        .send({ status: "COMPLETED" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.status).toBe("COMPLETED");

      const deleteRes = await request(app)
        .delete(`/api/sub-phases/${subPhaseId}`)
        .set("Authorization", authHeader(admin));
      expect(deleteRes.status).toBe(204);
    });

    it("blocks a COLLABORATOR from creating a sub-phase", async () => {
      const { phase } = await buildHierarchy();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const res = await request(app)
        .post("/api/sub-phases")
        .set("Authorization", authHeader(collaborator))
        .send({ phaseId: phase.id, name: "Underground" });
      expect(res.status).toBe(403);
    });

    it("admin can create and delete a sub-phase assignment", async () => {
      const { phase } = await buildHierarchy();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });

      const createRes = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/assignments`)
        .set("Authorization", authHeader(admin))
        .send({ userId: collaborator.id });
      expect(createRes.status).toBe(201);

      const deleteRes = await request(app)
        .delete(`/api/sub-phases/${subPhase.id}/assignments/${collaborator.id}`)
        .set("Authorization", authHeader(admin));
      expect(deleteRes.status).toBe(204);
    });

    it("blocks an ENTREPRENEUR from assigning a COLLABORATOR they did not create", async () => {
      const { phase, project } = await buildHierarchy();
      await prisma.project.update({ where: { id: project.id }, data: { entrepreneurId: entrepreneur.id } });
      const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other-e@test.local" });
      const foreignCollaborator = await createUser({
        role: Role.COLLABORATOR,
        trade: Trade.ELECTRICIAN,
        createdById: otherEntrepreneur.id,
      });
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });

      const res = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/assignments`)
        .set("Authorization", authHeader(entrepreneur))
        .send({ userId: foreignCollaborator.id });
      expect(res.status).toBe(403);
    });

    it("allows an ENTREPRENEUR to assign a COLLABORATOR they created", async () => {
      const { phase } = await buildHierarchy();
      const ownCollaborator = await createUser({
        role: Role.COLLABORATOR,
        trade: Trade.ELECTRICIAN,
        createdById: entrepreneur.id,
      });
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });

      const res = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/assignments`)
        .set("Authorization", authHeader(entrepreneur))
        .send({ userId: ownCollaborator.id });
      expect(res.status).toBe(201);
    });

    it("GET /:id returns 403 for a COLLABORATOR not assigned to the sub-phase", async () => {
      const { phase } = await buildHierarchy();
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const res = await request(app)
        .get(`/api/sub-phases/${subPhase.id}`)
        .set("Authorization", authHeader(collaborator));
      expect(res.status).toBe(403);
    });

    it("GET /:id succeeds for an assigned COLLABORATOR and for an admin", async () => {
      const { phase } = await buildHierarchy();
      const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      await prisma.phaseAssignment.create({ data: { userId: collaborator.id, subPhaseId: subPhase.id } });

      const collabRes = await request(app)
        .get(`/api/sub-phases/${subPhase.id}`)
        .set("Authorization", authHeader(collaborator));
      expect(collabRes.status).toBe(200);

      const adminRes = await request(app)
        .get(`/api/sub-phases/${subPhase.id}`)
        .set("Authorization", authHeader(admin));
      expect(adminRes.status).toBe(200);
    });
  });
});
