import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/prisma";

let userCounter = 0;

export async function resetDb() {
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(opts: {
  role: string;
  trade?: string | null;
  name?: string;
  email?: string;
  password?: string;
}) {
  userCounter += 1;
  const password = opts.password ?? "password123";
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `User ${userCounter}`,
      email: opts.email ?? `user${userCounter}@test.local`,
      passwordHash,
      role: opts.role,
      trade: opts.trade ?? null,
    },
  });
  return { ...user, password };
}

export function tokenFor(user: { id: number; role: string }) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}

export function authHeader(user: { id: number; role: string }) {
  return `Bearer ${tokenFor(user)}`;
}

// 1x1 transparent PNG, valid image/png upload.
export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
