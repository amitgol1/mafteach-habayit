import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

async function buildProjectHierarchy(name = "Villa Project") {
  const project = await prisma.project.create({ data: { name, location: "Somewhere" } });
  const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
  const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
  const subPhaseA = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
  const subPhaseB = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Ground Floor" } });
  return { project, unit, phase, subPhaseA, subPhaseB };
}

describe("/api/projects", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.ADMIN });
  });

  describe("GET / and GET /:id — role-based access", () => {
    it("admin sees all projects", async () => {
      await buildProjectHierarchy("Project 1");
      await buildProjectHierarchy("Project 2");

      const res = await request(app).get("/api/projects").set("Authorization", authHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("a COLLABORATOR assigned to a sub-phase sees the project, scoped to their assigned sub-phases", async () => {
      const { project, subPhaseA } = await buildProjectHierarchy();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      await prisma.phaseAssignment.create({ data: { userId: collaborator.id, subPhaseId: subPhaseA.id } });

      const listRes = await request(app).get("/api/projects").set("Authorization", authHeader(collaborator));
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(project.id);
      const subPhaseIds = listRes.body[0].units[0].phases[0].subPhases.map((sp: { id: number }) => sp.id);
      expect(subPhaseIds).toEqual([subPhaseA.id]);

      const detailRes = await request(app)
        .get(`/api/projects/${project.id}`)
        .set("Authorization", authHeader(collaborator));
      expect(detailRes.status).toBe(200);
      const detailSubPhaseIds = detailRes.body.units[0].phases[0].subPhases.map((sp: { id: number }) => sp.id);
      expect(detailSubPhaseIds).toEqual([subPhaseA.id]);
    });

    it("a COLLABORATOR with only a ProjectParticipant row (no sub-phase assignment) also sees the project", async () => {
      const { project } = await buildProjectHierarchy();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      await prisma.projectParticipant.create({
        data: { projectId: project.id, userId: collaborator.id, trade: Trade.ELECTRICIAN },
      });

      const listRes = await request(app).get("/api/projects").set("Authorization", authHeader(collaborator));
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(project.id);

      const detailRes = await request(app)
        .get(`/api/projects/${project.id}`)
        .set("Authorization", authHeader(collaborator));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(project.id);
    });

    it("a COLLABORATOR with neither an assignment nor a participant row gets an empty list and 403 on GET /:id", async () => {
      const { project } = await buildProjectHierarchy();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const listRes = await request(app).get("/api/projects").set("Authorization", authHeader(collaborator));
      expect(listRes.status).toBe(200);
      expect(listRes.body).toEqual([]);

      const detailRes = await request(app)
        .get(`/api/projects/${project.id}`)
        .set("Authorization", authHeader(collaborator));
      expect(detailRes.status).toBe(403);
    });
  });

  describe("POST / — participant validation", () => {
    it("rejects more than 7 participants", async () => {
      const user = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      const participants = Array.from({ length: 8 }, () => ({ trade: Trade.ELECTRICIAN, userId: user.id }));

      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", participants });

      expect(res.status).toBe(400);
    });

    it("rejects an invalid Trade value", async () => {
      const user = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", participants: [{ trade: "PAINTER", userId: user.id }] });

      expect(res.status).toBe(400);
    });

    it("rejects duplicate trades within one request", async () => {
      const userA = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN, email: "a@test.local" });
      const userB = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN, email: "b@test.local" });

      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({
          name: "P",
          location: "L",
          participants: [
            { trade: Trade.ELECTRICIAN, userId: userA.id },
            { trade: Trade.ELECTRICIAN, userId: userB.id },
          ],
        });

      expect(res.status).toBe(400);
    });

    it("rejects a userId that does not exist", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", participants: [{ trade: Trade.ELECTRICIAN, userId: 999999 }] });

      expect(res.status).toBe(400);
    });

    it("creates a project with valid participants", async () => {
      const user = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", participants: [{ trade: Trade.ELECTRICIAN, userId: user.id }] });

      expect(res.status).toBe(201);
      expect(res.body.participants).toHaveLength(1);
      expect(res.body.participants[0].trade).toBe(Trade.ELECTRICIAN);
    });
  });

  describe("PATCH /:id — partial updates", () => {
    it("only touches provided fields, leaving participants untouched when omitted", async () => {
      const user = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({
          name: "Original",
          location: "Original Location",
          totalBudget: 1000,
          participants: [{ trade: Trade.ELECTRICIAN, userId: user.id }],
        });
      const projectId = created.body.id;

      const patchRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", authHeader(admin))
        .send({ name: "Updated Name" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.name).toBe("Updated Name");
      expect(patchRes.body.location).toBe("Original Location");
      expect(patchRes.body.totalBudget).toBe(1000);
      expect(patchRes.body.participants).toHaveLength(1);
      expect(patchRes.body.participants[0].trade).toBe(Trade.ELECTRICIAN);
    });

    it("replaces the full participant set when participants is provided", async () => {
      const userA = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN, email: "a@test.local" });
      const userB = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, email: "b@test.local" });
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "Original", location: "L", participants: [{ trade: Trade.ELECTRICIAN, userId: userA.id }] });
      const projectId = created.body.id;

      const patchRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", authHeader(admin))
        .send({ participants: [{ trade: Trade.PLUMBER, userId: userB.id }] });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.participants).toHaveLength(1);
      expect(patchRes.body.participants[0].trade).toBe(Trade.PLUMBER);
      expect(patchRes.body.participants[0].userId).toBe(userB.id);
    });
  });
});
