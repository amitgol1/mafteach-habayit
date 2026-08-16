import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { createUser, resetDb } from "./helpers";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("succeeds with valid credentials", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "admin@test.local", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      role: Role.SUPER_ADMIN,
    });
  });

  it("fails with wrong password", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "admin2@test.local", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("fails with unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.local", password: "whatever" });

    expect(res.status).toBe(401);
  });
});
