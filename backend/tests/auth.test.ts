import { beforeEach, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb } from "./helpers";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await resetDb();
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

  it("returns totp_setup_required with valid credentials and no confirmed TOTP", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "admin@test.local", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("totp_setup_required");
    expect(res.body.pendingToken).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      role: Role.SUPER_ADMIN,
    });
  });

  it("returns totp_required with valid credentials and confirmed TOTP", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "admin3@test.local", password: "secret123" });
    await prisma.user.update({ where: { id: user.id }, data: { totpConfirmedAt: new Date() } });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("totp_required");
    expect(res.body.pendingToken).toBeTypeOf("string");
  });
});

describe("POST /api/auth/totp/setup, /confirm, /verify", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function loginAndGetPendingToken(email: string, password: string) {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    return res.body.pendingToken as string;
  }

  it("setup returns a secret, otpauthUrl, and QR code", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "setup1@test.local", password: "secret123" });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");

    const res = await request(app).post("/api/auth/totp/setup").set("Authorization", `Bearer ${pendingToken}`);

    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTypeOf("string");
    expect(res.body.otpauthUrl).toContain("otpauth://");
    expect(res.body.qrCodeDataUrl).toContain("data:image/png;base64,");
  });

  it("setup rejects a plain session token (not a pending token)", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "setup2@test.local", password: "secret123" });

    const res = await request(app).post("/api/auth/totp/setup").set("Authorization", authHeader(user));

    expect(res.status).toBe(401);
  });

  it("setup returns 409 when TOTP is already confirmed", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "setup3@test.local", password: "secret123" });
    await prisma.user.update({ where: { id: user.id }, data: { totpConfirmedAt: new Date() } });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");

    const res = await request(app).post("/api/auth/totp/setup").set("Authorization", `Bearer ${pendingToken}`);

    expect(res.status).toBe(409);
  });

  it("confirm succeeds with a valid code and issues a session token", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "confirm1@test.local", password: "secret123" });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const setupRes = await request(app).post("/api/auth/totp/setup").set("Authorization", `Bearer ${pendingToken}`);
    const code = authenticator.generate(setupRes.body.secret);

    const res = await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email });

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.totpConfirmedAt).not.toBeNull();
  });

  it("confirm fails with an invalid code", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "confirm2@test.local", password: "secret123" });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");
    await request(app).post("/api/auth/totp/setup").set("Authorization", `Bearer ${pendingToken}`);

    const res = await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ code: "000000" });

    expect(res.status).toBe(401);
  });

  it("confirm returns 400 when setup was never called", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "confirm3@test.local", password: "secret123" });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");

    const res = await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ code: "123456" });

    expect(res.status).toBe(400);
  });

  it("confirm returns 409 when already confirmed", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "confirm4@test.local", password: "secret123" });
    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const setupRes = await request(app).post("/api/auth/totp/setup").set("Authorization", `Bearer ${pendingToken}`);
    const code = authenticator.generate(setupRes.body.secret);
    await request(app).post("/api/auth/totp/confirm").set("Authorization", `Bearer ${pendingToken}`).send({ code });

    const secondPendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const res = await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${secondPendingToken}`)
      .send({ code: authenticator.generate(setupRes.body.secret) });

    expect(res.status).toBe(409);
  });

  it("verify succeeds with a valid code for an already-confirmed user", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "verify1@test.local", password: "secret123" });
    const firstPendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const setupRes = await request(app)
      .post("/api/auth/totp/setup")
      .set("Authorization", `Bearer ${firstPendingToken}`);
    await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${firstPendingToken}`)
      .send({ code: authenticator.generate(setupRes.body.secret) });

    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const res = await request(app)
      .post("/api/auth/totp/verify")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ code: authenticator.generate(setupRes.body.secret) });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
  });

  it("verify fails with an invalid code", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, email: "verify2@test.local", password: "secret123" });
    const firstPendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const setupRes = await request(app)
      .post("/api/auth/totp/setup")
      .set("Authorization", `Bearer ${firstPendingToken}`);
    await request(app)
      .post("/api/auth/totp/confirm")
      .set("Authorization", `Bearer ${firstPendingToken}`)
      .send({ code: authenticator.generate(setupRes.body.secret) });

    const pendingToken = await loginAndGetPendingToken(user.email, "secret123");
    const res = await request(app)
      .post("/api/auth/totp/verify")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ code: "000000" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/users/:id/reset-totp", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let entrepreneur: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.SUPER_ADMIN });
    entrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "entrepreneur@test.local" });
  });

  it("clears totpSecret and totpConfirmedAt for a user the caller owns", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR, createdById: entrepreneur.id });
    await prisma.user.update({
      where: { id: collaborator.id },
      data: { totpSecret: "iv:tag:ct", totpConfirmedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/users/${collaborator.id}/reset-totp`)
      .set("Authorization", authHeader(entrepreneur));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(collaborator.id);

    const updated = await prisma.user.findUnique({ where: { id: collaborator.id } });
    expect(updated?.totpSecret).toBeNull();
    expect(updated?.totpConfirmedAt).toBeNull();
  });

  it("returns 403 for an ENTREPRENEUR resetting a user they don't own", async () => {
    const otherEntrepreneur = await createUser({ role: Role.ENTREPRENEUR, email: "other@test.local" });
    const foreignCollaborator = await createUser({ role: Role.COLLABORATOR, createdById: otherEntrepreneur.id });

    const res = await request(app)
      .post(`/api/users/${foreignCollaborator.id}/reset-totp`)
      .set("Authorization", authHeader(entrepreneur));

    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing user", async () => {
    const res = await request(app).post("/api/users/999999/reset-totp").set("Authorization", authHeader(admin));

    expect(res.status).toBe(404);
  });
});
