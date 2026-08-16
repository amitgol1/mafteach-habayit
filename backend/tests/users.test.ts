import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { authHeader, createUser, resetDb } from "./helpers";

describe("/api/users", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.ADMIN });
  });

  it("creates a user with a valid trade", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
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
      .set("Authorization", authHeader(admin))
      .send({
        name: "Jane",
        email: "jane2@test.local",
        password: "pw123456",
        role: Role.COLLABORATOR,
        trade: "PAINTER",
      });

    expect(res.status).toBe(400);
  });

  it("lists all users", async () => {
    await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Bob", email: "bob@test.local" });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("filters users by trade via /by-trade", async () => {
    await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER, name: "Bob", email: "bob@test.local" });
    await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN, name: "Amy", email: "amy@test.local" });

    const res = await request(app)
      .get("/api/users/by-trade")
      .query({ trade: Trade.PLUMBER })
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Bob");
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
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER });

    const res = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(admin))
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("rejects an invalid trade on update", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.PLUMBER });

    const res = await request(app)
      .patch(`/api/users/${collaborator.id}`)
      .set("Authorization", authHeader(admin))
      .send({ trade: "PAINTER" });

    expect(res.status).toBe(400);
  });

  it("deletes a user", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR });

    const res = await request(app).delete(`/api/users/${collaborator.id}`).set("Authorization", authHeader(admin));
    expect(res.status).toBe(204);

    const check = await request(app).get("/api/users").set("Authorization", authHeader(admin));
    expect(check.body.find((u: { id: number }) => u.id === collaborator.id)).toBeUndefined();
  });
});
