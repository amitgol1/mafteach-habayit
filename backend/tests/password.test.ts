import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { prisma } from "../src/prisma";
import { hashPassword, needsRehash, verifyPassword } from "../src/utils/password";
import { authHeader, createUser, resetDb } from "./helpers";

describe("password hashing", () => {
  it("verifies a PBKDF2 hash and rejects a wrong password", async () => {
    const hash = await hashPassword("secret123");

    expect(hash.startsWith("pbkdf2-sha256$50000$")).toBe(true);
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("secret124", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("still verifies legacy bcrypt hashes and flags them for rehash", async () => {
    const legacy = await bcrypt.hash("secret123", 4);

    expect(await verifyPassword("secret123", legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });
});

describe("password storage via the API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("re-hashes a legacy bcrypt password to PBKDF2 on successful login", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });
    expect(res.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash.startsWith("pbkdf2-sha256$")).toBe(true);

    const again = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });
    expect(again.status).toBe(200);
  });

  it("does not re-hash on a failed login", async () => {
    const user = await createUser({ role: Role.SUPER_ADMIN, password: "secret123" });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong" });

    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect(after).toBe(before);
  });

  it("stores new users' passwords as PBKDF2", async () => {
    const admin = await createUser({ role: Role.SUPER_ADMIN });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({ name: "New", email: "new@test.local", password: "secret123", role: Role.ENTREPRENEUR });
    expect(res.status).toBe(201);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.passwordHash.startsWith("pbkdf2-sha256$")).toBe(true);
  });
});
