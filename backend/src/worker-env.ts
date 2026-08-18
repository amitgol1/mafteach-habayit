// Shared Hono context typing for the Worker POC — every route-worker/
// middleware-worker file uses this so `Hono<AppEnv>()` and `c.get("user")`
// are consistent across files.
export type Bindings = {
  DB: D1Database;
  UPLOADS_BUCKET: R2Bucket;
  JWT_SECRET: string;
};

export type AuthedUser = { id: number; role: string };

export type Variables = {
  user: AuthedUser;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
