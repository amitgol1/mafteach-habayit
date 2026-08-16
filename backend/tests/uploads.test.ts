import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { Role, Trade } from "../src/constants";
import { prisma } from "../src/prisma";
import { authHeader, createUser, resetDb, tinyPng } from "./helpers";

const testUploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR!);
const realUploadsDir = path.resolve(process.cwd(), "../uploads");

function filenameFromUrl(url: string) {
  return url.split("/").pop()!;
}

describe("file uploads", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: Role.ADMIN });
  });

  it("uses the test UPLOADS_DIR, not the real /uploads directory", () => {
    expect(testUploadsDir).not.toBe(realUploadsDir);
    expect(testUploadsDir).toContain("tests-tmp");
  });

  describe("POST /api/projects/:projectId/financials (receipt)", () => {
    it("accepts a valid image and stores it under the test uploads dir", async () => {
      const project = await prisma.project.create({ data: { name: "P", location: "L", totalBudget: 1000 } });

      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .field("amountPaid", "100")
        .attach("receipt", tinyPng, { filename: "receipt.png", contentType: "image/png" });

      expect(res.status).toBe(201);
      expect(res.body.receiptMediaUrl).toMatch(/^\/uploads\//);

      const storedPath = path.join(testUploadsDir, filenameFromUrl(res.body.receiptMediaUrl));
      expect(fs.existsSync(storedPath)).toBe(true);
      expect(fs.existsSync(path.join(realUploadsDir, filenameFromUrl(res.body.receiptMediaUrl)))).toBe(false);
    });

    it("rejects a disallowed mime type", async () => {
      const project = await prisma.project.create({ data: { name: "P", location: "L", totalBudget: 1000 } });

      const res = await request(app)
        .post(`/api/projects/${project.id}/financials`)
        .set("Authorization", authHeader(admin))
        .field("amountPaid", "100")
        .attach("receipt", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/sub-phases/:id/updates (media)", () => {
    async function buildSubPhase() {
      const project = await prisma.project.create({ data: { name: "P", location: "L" } });
      const unit = await prisma.unit.create({ data: { projectId: project.id, identifier: "House A" } });
      const phase = await prisma.phase.create({ data: { unitId: unit.id, name: "Skeleton", order: 1 } });
      return prisma.subPhase.create({ data: { phaseId: phase.id, name: "Underground" } });
    }

    it("accepts a valid image and stores it under the test uploads dir", async () => {
      const subPhase = await buildSubPhase();

      const res = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/updates`)
        .set("Authorization", authHeader(admin))
        .field("messageText", "Progress photo")
        .attach("media", tinyPng, { filename: "photo.png", contentType: "image/png" });

      expect(res.status).toBe(201);
      expect(res.body.mediaUrl).toMatch(/^\/uploads\//);
      expect(res.body.mediaType).toBe("IMAGE");

      const storedPath = path.join(testUploadsDir, filenameFromUrl(res.body.mediaUrl));
      expect(fs.existsSync(storedPath)).toBe(true);
      expect(fs.existsSync(path.join(realUploadsDir, filenameFromUrl(res.body.mediaUrl)))).toBe(false);
    });

    it("blocks an unassigned COLLABORATOR even with a valid file", async () => {
      const subPhase = await buildSubPhase();
      const collaborator = await createUser({ role: Role.COLLABORATOR, trade: Trade.ELECTRICIAN });

      const res = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/updates`)
        .set("Authorization", authHeader(collaborator))
        .attach("media", tinyPng, { filename: "photo.png", contentType: "image/png" });

      expect(res.status).toBe(403);
    });

    it("rejects a disallowed mime type", async () => {
      const subPhase = await buildSubPhase();

      const res = await request(app)
        .post(`/api/sub-phases/${subPhase.id}/updates`)
        .set("Authorization", authHeader(admin))
        .attach("media", Buffer.from("not media"), { filename: "notes.txt", contentType: "text/plain" });

      expect(res.status).toBe(400);
    });
  });
});
