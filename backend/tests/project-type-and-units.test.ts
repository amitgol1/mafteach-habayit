import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

describe("projectType + POST /api/units/bulk", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  describe("POST /api/projects — projectType", () => {
    it("creates a project with a valid projectType", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", entrepreneurId: entrepreneur.id, projectType: "PRIVATE_HOUSES" });

      expect(res.status).toBe(201);
      expect(res.body.projectType).toBe("PRIVATE_HOUSES");
    });

    it("defaults projectType to null when omitted", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", entrepreneurId: entrepreneur.id });

      expect(res.status).toBe(201);
      expect(res.body.projectType).toBeNull();
    });

    it("rejects an invalid projectType value", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", entrepreneurId: entrepreneur.id, projectType: "BUNGALOW" });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/projects/:id — projectType", () => {
    it("updates projectType on an existing project", async () => {
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", entrepreneurId: entrepreneur.id });
      const projectId = created.body.id;
      expect(created.body.projectType).toBeNull();

      const patchRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", authHeader(admin))
        .send({ projectType: "RESIDENTIAL_BUILDING" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.projectType).toBe("RESIDENTIAL_BUILDING");
    });

    it("rejects an invalid projectType value on update", async () => {
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader(admin))
        .send({ name: "P", location: "L", entrepreneurId: entrepreneur.id });
      const projectId = created.body.id;

      const patchRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", authHeader(admin))
        .send({ projectType: "BUNGALOW" });

      expect(patchRes.status).toBe(400);
    });
  });

  describe("POST /api/units/bulk", () => {
    it("creates all units in one request (happy path)", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifiers: ["בית 1", "בית 2", "בית 3"] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(3);
      expect(res.body.map((u: { identifier: string }) => u.identifier)).toEqual(["בית 1", "בית 2", "בית 3"]);
      expect(res.body.every((u: { projectId: number }) => u.projectId === project.id)).toBe(true);

      const unitsInDb = await prisma.unit.findMany({ where: { projectId: project.id } });
      expect(unitsInDb).toHaveLength(3);
    });

    it("rejects an empty identifiers array", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifiers: [] });

      expect(res.status).toBe(400);
    });

    it("rejects more than 100 identifiers", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });
      const identifiers = Array.from({ length: 101 }, (_, i) => `בית ${i + 1}`);

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifiers });

      expect(res.status).toBe(400);
    });

    it("accepts exactly 100 identifiers", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });
      const identifiers = Array.from({ length: 100 }, (_, i) => `בית ${i + 1}`);

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifiers });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(100);
    });

    it("rejects blank-string entries", async () => {
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: project.id, identifiers: ["בית 1", "   "] });

      expect(res.status).toBe(400);
    });

    it("blocks a COLLABORATOR from bulk-creating units", async () => {
      const collaborator = await createUser({ role: Role.COLLABORATOR });
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(collaborator))
        .send({ projectId: project.id, identifiers: ["בית 1"] });

      expect(res.status).toBe(403);
    });

    it("blocks an ENTREPRENEUR from bulk-creating units on a project they do not own", async () => {
      const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });
      const project = await prisma.project.create({
        data: { name: "P", location: "L", entrepreneurId: entrepreneur.id },
      });

      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(otherEntrepreneur))
        .send({ projectId: project.id, identifiers: ["בית 1"] });

      expect(res.status).toBe(403);
    });

    it("returns 404 for a nonexistent project", async () => {
      const res = await request(app)
        .post("/api/units/bulk")
        .set("Authorization", authHeader(admin))
        .send({ projectId: 999999, identifiers: ["בית 1"] });

      expect(res.status).toBe(404);
    });
  });
});
