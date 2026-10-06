import { Hono } from "hono";
import { chunkKey, type UploadManifest } from "../utils-worker/upload";
import type { AppEnv } from "../worker-env";

// Serves files written to KV by src/utils-worker/upload.ts, replacing
// Express's `app.use("/uploads", express.static(uploadsRoot))`. Supports a
// single `Range: bytes=` request like express.static does — iOS Safari won't
// play <video> without 206 responses.
export const uploadsRouter = new Hono<AppEnv>();

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

uploadsRouter.get("/:key", async (c) => {
  const key = c.req.param("key");
  const manifest = await c.env.UPLOADS_KV.get<UploadManifest>(key, "json");
  if (!manifest) {
    return c.notFound();
  }

  const range = parseRange(c.req.header("Range"), manifest.size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${manifest.size}` } });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? manifest.size - 1;
  const firstChunk = Math.floor(start / manifest.chunkSize);
  const lastChunk = Math.floor(end / manifest.chunkSize);

  const kv = c.env.UPLOADS_KV;
  // FixedLengthStream so the response carries a real Content-Length (media
  // players need it) instead of chunked transfer encoding.
  const { readable, writable } = new FixedLengthStream(end - start + 1);
  const pump = (async () => {
    const writer = writable.getWriter();
    try {
      for (let i = firstChunk; i <= lastChunk; i++) {
        const chunk = await kv.get(chunkKey(key, i), "arrayBuffer");
        if (!chunk) throw new Error(`missing chunk ${i} of ${key}`);
        const chunkStart = i * manifest.chunkSize;
        const from = Math.max(start - chunkStart, 0);
        const to = Math.min(end - chunkStart + 1, chunk.byteLength);
        await writer.write(new Uint8Array(chunk, from, to - from));
      }
      await writer.close();
    } catch (err) {
      await writer.abort(err);
    }
  })();
  c.executionCtx.waitUntil(pump);

  const headers = new Headers({
    "Content-Type": manifest.contentType,
    "Accept-Ranges": "bytes",
  });
  if (range) {
    headers.set("Content-Range", `bytes ${start}-${end}/${manifest.size}`);
  }
  return new Response(readable, { status: range ? 206 : 200, headers });
});
