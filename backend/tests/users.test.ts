import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

describe("/api/users", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  it("SUPER_ADMIN creates an ENTREPRENEUR, with createdById set server-side", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        name: "Yosef",
        email: "yosef@test.local",
        password: "pw123456",
        role: Role.ENTREPRENEUR,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Yosef", email: "yosef@test.local", role: Role.ENTREPRENEUR });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects a SUPER_ADMIN trying to create another SUPER_ADMIN or a COLLABORATOR", async () => {
    const superAdminRes = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({ name: "X", email: "x1@test.local", password: "pw123456", role: Role.SUPER_ADMIN });
    expect(superAdminRes.status).toBe(400);

    const collaboratorRes = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({ name: "X", email: "x2@test.local", password: "pw123456", role: Role.COLLABORATOR });
    expect(collaboratorRes.status).toBe(400);
  });

  it("creates a user with a valid trade", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(entrepreneur))
      .send({
        name: "Jane",
        email: "jane@test.local",
        password: "pw123456",
        role: Role.COLLABORATOR,
        trade: Trade.ELECTRICIAN,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Jane",
      email: "jane@test.local",
      role: Role.COLLABORATOR,
      trade: Trade.ELECTRICIAN,
    });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects creation with an invalid trade", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(entrepreneur))
      .send({
        name: "Jane",
        email: "jane2@test.local",
        password: "pw123456",
        role: Role.COLLABORATOR,
        trade: "PAINTER",
      });

    expect(res.status).toBe(400);
  });

  it("rejects an ENTREPRENEUR trying to create a SUPER_ADMIN or another ENTREPRENEUR", async () => {
    const superAdminRes = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(entrepreneur))
      .send({ name: "X", email: "x3@test.local", password: "pw123456", role: Role.SUPER_ADMIN });
    expect(superAdminRes.status).toBe(400);

    const entrepreneurRes = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(entrepreneur))
      .send({ name: "X", email: "x4@test.local", password: "pw123456", role: Role.ENTREPRENEUR });
    expect(entrepreneurRes.status).toBe(400);
  });

  it("rejects a COLLABORATOR from the users router entirely", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, createdById: entrepreneur.id });
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(collaborator))
      .send({ name: "X", email: "x5@test.local", password: "pw123456", role: Role.COLLABORATOR });
    expect(res.status).toBe(403);
  });

  it("enforces the 20-user quota for an ENTREPRENEUR (SUPER_ADMIN unaffected)", async () => {
    for (let i = 1; i <= 20; i++) {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", authHeader(entrepreneur))
        .send({ name: `U${i}`, email: `u${i}@test.local`, password: "pw123456", role: Role.COLLABORATOR });
      expect(res.status).toBe(201);
    }

    const res21 = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(entrepreneur))
      .send({ name: "U21", email: "u21@test.local", password: "pw123456", role: Role.COLLABORATOR });
    expect(res21.status).toBe(403);
    expect(res21.body.error).toBe("הגעת למכסת המשתמשים המקסימלית (20 משתמשים)");
  }, 20000);

  it("lists all users for a SUPER_ADMIN", async () => {
    await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Bob", email: "bob@test.local", createdById: entrepreneur.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3); // admin + entrepreneur + bob
  });

  it("scopes GET /api/users to an ENTREPRENEUR's own users (tenant isolation)", async () => {
    const bob = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Bob", email: "bob@test.local", createdById: entrepreneur.id });
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });
    await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Foreign", email: "foreign@test.local", createdById: otherEntrepreneur.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(entrepreneur));

    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: number }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([entrepreneur.id, bob.id]));
    expect(ids).not.toContain(otherEntrepreneur.id);
  });

  it("filters users by trade via /by-trade", async () => {
    await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Bob", email: "bob@test.local", createdById: entrepreneur.id });
    await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN, name: "Amy", email: "amy@test.local", createdById: entrepreneur.id });

    const res = await request(app)
      .get("/api/users/by-trade")
      .query({ trade: Trade.PLUMBER })
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Bob");
  });

  it("scopes /by-trade to the acting entrepreneur's own collaborators", async () => {
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other-ent@test.local" });
    await createUser({
      role: Role.COLLABORATOR,
      trade: Trade.PLUMBER,
      name: "Mine",
      email: "mine@test.local",
      createdById: entrepreneur.id,
    });
    await createUser({
      role: Role.COLLABORATOR,
      trade: Trade.PLUMBER,
      name: "TheirsNotMine",
      email: "theirs@test.local",
      createdById: otherEntrepreneur.id,
    });

    const res = await request(app)
      .get("/api/users/by-trade")
      .query({ trade: Trade.PLUMBER })
      .set("Authorization", authHeader(entrepreneur));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Mine");
  });

  it("rejects an invalid trade on /by-trade", async () => {
    const res = await request(app)
      .get("/api/users/by-trade")
      .query({ trade: "PAINTER" })
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(400);
  });

  it("requires the trade query param on /by-trade", async () => {
    const res = await request(app).get("/api/users/by-trade").set("Authorization", authHeader(admin));
    expect(res.status).toBe(400);
  });

  it("updates a user's name", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, createdById: entrepreneur.id });

    const res = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(admin))
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("rejects an invalid trade on update", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, createdById: entrepreneur.id });

    const res = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(admin))
      .send({ trade: "PAINTER" });

    expect(res.status).toBe(400);
  });

  it("blocks an ENTREPRENEUR from escalating a collaborator's role to SUPER_ADMIN or ENTREPRENEUR", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, createdById: entrepreneur.id });

    const toSuperAdmin = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(entrepreneur))
      .send({ role: Role.SUPER_ADMIN });
    expect(toSuperAdmin.status).toBe(400);

    const toEntrepreneur = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(entrepreneur))
      .send({ role: Role.ENTREPRENEUR });
    expect(toEntrepreneur.status).toBe(400);

    const unchanged = await prisma.user.findUnique({ where: { id: collaborator.id } });
    expect(unchanged?.role).toBe(Role.COLLABORATOR);
  });

  it("blocks a SUPER_ADMIN from setting a user's role to anything other than ENTREPRENEUR", async () => {
    const res = await request(app)
      .patch(`/api/users/${entrepreneur.id}`)
      .set("Authorization", authHeader(admin))
      .send({ role: Role.SUPER_ADMIN });

    expect(res.status).toBe(400);
  });

  it("blocks an ENTREPRENEUR from updating or deleting a user they did not create (tenant isolation)", async () => {
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other2@test.local" });
    const foreignCollaborator = await createUser({
      role: Role.COLLABORATOR,
      trade: Trade.PLUMBER,
      createdById: otherEntrepreneur.id,
    });

    const patchRes = await request(app)
      .patch(`/api/users/${foreignCollaborator.id}`)
      .set("Authorization", authHeader(entrepreneur))
      .send({ name: "Hijacked" });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/users/${foreignCollaborator.id}`)
      .set("Authorization", authHeader(entrepreneur));
    expect(deleteRes.status).toBe(403);
  });

  it("deletes a user", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, createdById: entrepreneur.id });

    const res = await request(app).delete(`/api/users/${collaborator.id}`).set("Authorization", authHeader(admin));
    expect(res.status).toBe(204);

    const check = await request(app).get("/api/users").set("Authorization", authHeader(admin));
    expect(check.body.find((u: { id: number }) => u.id === collaborator.id)).toBeUndefined();
  });
});
