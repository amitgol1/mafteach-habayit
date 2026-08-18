import { Hono } from "hono";
import type { AppEnv } from "../worker-env";

// Serves files written to R2 by src/utils-worker/upload.ts, replacing
// Express's `app.use("/uploads", express.static(uploadsRoot))`. R2 has no
// static-file-server equivalent in the Workers runtime, so this streams the
// object back explicitly; `writeHttpMetadata` restores the Content-Type
// recorded at upload time (see storeUpload's `httpMetadata.contentType`).
export const uploadsRouter = new Hono<AppEnv>();

uploadsRouter.get("/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.UPLOADS_BUCKET.get(key);
  if (!object) {
    return c.notFound();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});
