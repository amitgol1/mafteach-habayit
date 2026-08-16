import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb, tinyPng } from "./helpers";

async function buildSubPhase(entrepreneurId: number) {
  const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId } });
  const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
  const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
  const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
  return { project, subPhase };
}

describe("POST /api/sub-phases/:id/updates", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  it("requires subject, description or media file", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({});

    expect(res.status).toBe(400);
  });

  it("accepts description alone", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ description: "Poured the foundation" });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe("Poured the foundation");
  });

  it("accepts subject alone", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ subject: "Foundation" });

    expect(res.status).toBe(201);
    expect(res.body.subject).toBe("Foundation");
    expect(res.body.description).toBe(null);
  });

  it("blocks a COLLABORATOR not assigned to the sub-phase", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(collaborator))
      .send({ description: "Should be blocked" });

    expect(res.status).toBe(403);
  });

  it("allows an assigned COLLABORATOR to post an update", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
    await prisma.phaseAssignment.create({ data: { userId: collaborator.id, subPhaseId: subPhase.id } });

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(collaborator))
      .send({ description: "Assigned collaborator update" });

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(collaborator.id);
  });

  it("allows an admin to post an update to any sub-phase", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ description: "Admin update" });

    expect(res.status).toBe(201);
  });

  it("blocks an ENTREPRENEUR who does not own the project", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(otherEntrepreneur))
      .send({ description: "Should be blocked" });

    expect(res.status).toBe(403);
  });

  it("allows the owning ENTREPRENEUR to post an update", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(entrepreneur))
      .send({ description: "Owner update" });

    expect(res.status).toBe(201);
  });

  it("rejects media over the 15MB limit with a 400, not a 500", async () => {
    const { subPhase } = await buildSubPhase(entrepreneur.id);
    const oversized = Buffer.alloc(16 * 1024 * 1024);

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .field("description", "Too big")
      .attach("media", oversized, { filename: "big.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("/api/projects/:projectId/updates", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  it("requires subject, description or media file", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });

    const res = await request(app)
      .post(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(entrepreneur))
      .send({});

    expect(res.status).toBe(400);
  });

  it("allows the owning ENTREPRENEUR to post and read project-level updates", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });

    const postRes = await request(app)
      .post(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(entrepreneur))
      .send({ description: "Project kickoff" });
    expect(postRes.status).toBe(201);
    expect(postRes.body).toMatchObject({
      projectId: project.id,
      subPhaseId: null,
      description: "Project kickoff",
    });
    expect(postRes.body.user.id).toBe(entrepreneur.id);

    const getRes = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(entrepreneur));
    expect(getRes.status).toBe(200);
    expect(getRes.body.updates).toHaveLength(1);
    expect(getRes.body.updates[0].description).toBe("Project kickoff");
    expect(getRes.body.hasMore).toBe(false);
    expect(getRes.body.nextCursor).toBe(null);
  });

  it("allows an admin to post and read project-level updates for any project", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });

    const postRes = await request(app)
      .post(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ description: "Admin note" });
    expect(postRes.status).toBe(201);

    const getRes = await request(app).get(`/api/projects/${project.id}/updates`).set("Authorization", authHeader(admin));
    expect(getRes.status).toBe(200);
    expect(getRes.body.updates).toHaveLength(1);
  });

  it("allows a COLLABORATOR assigned via a sub-phase to read and post project-level updates", async () => {
    const { subPhase, project } = await buildSubPhase(entrepreneur.id);
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
    await prisma.phaseAssignment.create({ data: { userId: collaborator.id, subPhaseId: subPhase.id } });

    const postRes = await request(app)
      .post(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(collaborator))
      .send({ description: "Collaborator note" });
    expect(postRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(collaborator));
    expect(getRes.status).toBe(200);
    expect(getRes.body.updates).toHaveLength(1);
  });

  it("blocks an ENTREPRENEUR who does not own the project", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });

    const postRes = await request(app)
      .post(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(otherEntrepreneur))
      .send({ description: "Should be blocked" });
    expect(postRes.status).toBe(403);

    const getRes = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(otherEntrepreneur));
    expect(getRes.status).toBe(403);
  });

  it("blocks an unassigned COLLABORATOR", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

    const res = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(collaborator));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/projects/:projectId/updates pagination", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  async function createUpdates(projectId: number, count: number) {
    for (let i = 1; i <= count; i++) {
      const res = await request(app)
        .post(`/api/projects/${projectId}/updates`)
        .set("Authorization", authHeader(admin))
        .send({ description: `Update ${i}` });
      expect(res.status).toBe(201);
    }
  }

  it("returns the 10 newest updates, sorted newest-first by id, with hasMore/nextCursor", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
    await createUpdates(project.id, 15);

    const res = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.updates).toHaveLength(10);
    expect(res.body.updates.map((u: { description: string }) => u.description)).toEqual([
      "Update 15",
      "Update 14",
      "Update 13",
      "Update 12",
      "Update 11",
      "Update 10",
      "Update 9",
      "Update 8",
      "Update 7",
      "Update 6",
    ]);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBe(res.body.updates[9].id);

    const ids = res.body.updates.map((u: { id: number }) => u.id);
    expect([...ids]).toEqual([...ids].sort((a, b) => b - a));
  });

  it("pages through the remaining updates using `before`, ending with hasMore: false", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
    await createUpdates(project.id, 15);

    const firstPage = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .set("Authorization", authHeader(admin));
    expect(firstPage.body.hasMore).toBe(true);
    const cursor = firstPage.body.nextCursor;

    const secondPage = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .query({ before: cursor })
      .set("Authorization", authHeader(admin));

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.updates).toHaveLength(5);
    expect(secondPage.body.updates.map((u: { description: string }) => u.description)).toEqual([
      "Update 5",
      "Update 4",
      "Update 3",
      "Update 2",
      "Update 1",
    ]);
    expect(secondPage.body.hasMore).toBe(false);
    expect(secondPage.body.nextCursor).toBe(null);
  });

  it("respects a custom limit query param, clamped to [1, 50]", async () => {
    const project = await prisma.project.create({ data: { name: "P", location: "L", entrepreneurId: entrepreneur.id } });
    await createUpdates(project.id, 5);

    const res = await request(app)
      .get(`/api/projects/${project.id}/updates`)
      .query({ limit: 2 })
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.updates).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
  });
});

describe("financial.ts receipt uploads are unaffected by the 15MB update-media limit", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  it("accepts a receipt larger than 15MB (still governed by the 100MB financial limit)", async () => {
    const project = await prisma.project.create({
      data: { name: "P", location: "L", totalBudget: 1000, entrepreneurId: entrepreneur.id },
    });
    const overFifteenMb = Buffer.alloc(16 * 1024 * 1024);

    const res = await request(app)
      .post(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin))
      .field("amountPaid", "100")
      .attach("receipt", overFifteenMb, { filename: "receipt.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.receiptMediaUrl).toMatch(/^\/uploads\//);
  });

  it("still accepts a small receipt via tinyPng", async () => {
    const project = await prisma.project.create({
      data: { name: "P", location: "L", totalBudget: 1000, entrepreneurId: entrepreneur.id },
    });

    const res = await request(app)
      .post(`/api/projects/${project.id}/financials`)
      .set("Authorization", authHeader(admin))
      .field("amountPaid", "50")
      .attach("receipt", tinyPng, { filename: "receipt.png", contentType: "image/png" });

    expect(res.status).toBe(201);
  });
});
