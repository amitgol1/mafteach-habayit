import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Per-request Drizzle instance for the Worker (there is no long-lived
// process to hold a singleton client the way src/prisma.ts does — each
// request gets its own env.DB binding). Includes the relations-aware
// `schema` so route handlers can use `db.query.*` for Prisma `include`-style
// nested reads, matching the original routes' shape.
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
