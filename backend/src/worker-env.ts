// Shared Hono context typing for the Worker POC — every route-worker/
// middleware-worker file uses this so `Hono<AppEnv>()` and `c.get("user")`
// are consistent across files.
export type Bindings = {
  DB: D1Database;
  UPLOADS_KV: KVNamespace;
  JWT_SECRET: string;
  TOTP_ENCRYPTION_KEY: string;
};

export type AuthedUser = { id: number; role: string };

export type Variables = {
  user: AuthedUser;
  pendingUserId: number;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
