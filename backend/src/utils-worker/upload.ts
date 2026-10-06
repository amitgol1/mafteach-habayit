import type { MediaType } from "../constants";

// Port of src/utils/upload.ts. Multer's disk storage + fileFilter + limits
// become a single `storeUpload` that validates and writes directly to KV —
// there's no Workers-runtime middleware equivalent to Multer, so the
// validation it used to do inline (mime allowlist, size cap) is done here by
// hand against the Web-standard `File` Hono's `c.req.parseBody()` returns.

export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const documentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("Unsupported file type");
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("הקובץ גדול מדי (מקסימום 100MB)");
  }
}

export function mediaTypeFromMime(mimetype: string): "IMAGE" | "VIDEO" | "DOCUMENT" {
  if (mimetype.startsWith("video/")) return "VIDEO";
  if (documentMimeTypes.has(mimetype)) return "DOCUMENT";
  return "IMAGE";
}

export function uploadedFileUrl(key: string): string {
  return `/uploads/${key}`;
}

// Same collision-resistant naming scheme as Multer's diskStorage filename()
// (Date.now() + random suffix + original extension), reused as the KV key.
function objectKey(originalName: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex) : "";
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${ext}`;
}

// KV caps a single value at 25 MiB, so a file is stored as consecutive
// chunks under `<key>#<n>`, plus a small JSON manifest under `<key>` itself.
export const CHUNK_SIZE = 20 * 1024 * 1024;

export type UploadManifest = { contentType: string; size: number; chunkSize: number; chunks: number };

export function chunkKey(key: string, index: number): string {
  return `${key}#${index}`;
}

export async function putChunked(kv: KVNamespace, key: string, data: Blob, contentType: string): Promise<void> {
  const chunks = Math.max(1, Math.ceil(data.size / CHUNK_SIZE));
  for (let i = 0; i < chunks; i++) {
    await kv.put(chunkKey(key, i), await data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer());
  }
  const manifest: UploadManifest = { contentType, size: data.size, chunkSize: CHUNK_SIZE, chunks };
  // Manifest last: a reader never sees a manifest whose chunks aren't written yet.
  await kv.put(key, JSON.stringify(manifest));
}

export async function storeUpload(
  kv: KVNamespace,
  file: File
): Promise<{ url: string; mediaType: MediaType }> {
  if (!allowedMimeTypes.has(file.type)) {
    throw new UnsupportedFileTypeError();
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new FileTooLargeError();
  }
  const key = objectKey(file.name);
  await putChunked(kv, key, file, file.type);
  return { url: uploadedFileUrl(key), mediaType: mediaTypeFromMime(file.type) };
}
