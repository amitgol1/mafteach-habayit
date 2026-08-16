import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/constants";
import { authHeader, createUser, resetDb } from "./helpers";

// GET /api/users is a SUPER_ADMIN/ENTREPRENEUR-only route (requireAuth +
// requireRole), used here purely as a vehicle to exercise the shared auth middleware.
describe("auth middleware", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("requireAuth returns 401 with no token", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("requireAuth returns 401 with an invalid/garbage token", async () => {
    const res = await request(app).get("/api/users").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("requireRole returns 403 when a COLLABORATOR hits a SUPER_ADMIN/ENTREPRENEUR-only route", async () => {
    const collaborator = await createUser({ role: Role.COLLABORATOR });
    const res = await request(app).get("/api/users").set("Authorization", authHeader(collaborator));
    expect(res.status).toBe(403);
  });
});
