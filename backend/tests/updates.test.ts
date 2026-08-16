import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

async function buildSubPhase() {
  const project = await prisma.project.create({ data: { name: "P", location: "L" } });
  const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
  const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
  const subPhase = await prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
  return subPhase;
}

describe("POST /api/sub-phases/:id/updates", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.ADMIN });
  });

  it("requires messageText or a media file", async () => {
    const subPhase = await buildSubPhase();

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({});

    expect(res.status).toBe(400);
  });

  it("accepts messageText alone", async () => {
    const subPhase = await buildSubPhase();

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ messageText: "Poured the foundation" });

    expect(res.status).toBe(201);
    expect(res.body.messageText).toBe("Poured the foundation");
  });

  it("blocks a COLLABORATOR not assigned to the sub-phase", async () => {
    const subPhase = await buildSubPhase();
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(collaborator))
      .send({ messageText: "Should be blocked" });

    expect(res.status).toBe(403);
  });

  it("allows an assigned COLLABORATOR to post an update", async () => {
    const subPhase = await buildSubPhase();
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });
    await prisma.phaseAssignment.create({ data: { userId: collaborator.id, subPhaseId: subPhase.id } });

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(collaborator))
      .send({ messageText: "Assigned collaborator update" });

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(collaborator.id);
  });

  it("allows an admin to post an update to any sub-phase", async () => {
    const subPhase = await buildSubPhase();

    const res = await request(app)
      .post(`/api/sub-phases/${subPhase.id}/updates`)
      .set("Authorization", authHeader(admin))
      .send({ messageText: "Admin update" });

    expect(res.status).toBe(201);
  });
});
