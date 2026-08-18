import type { MediaType } from "../constants";

// Port of src/utils/upload.ts. Multer's disk storage + fileFilter + limits
// become a single `storeUpload` that validates and writes directly to R2 —
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
// (Date.now() + random suffix + original extension), reused as the R2
// object key.
function objectKey(originalName: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex) : "";
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${ext}`;
}

export async function storeUpload(
  bucket: R2Bucket,
  file: File
): Promise<{ url: string; mediaType: MediaType }> {
  if (!allowedMimeTypes.has(file.type)) {
    throw new UnsupportedFileTypeError();
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new FileTooLargeError();
  }
  const key = objectKey(file.name);
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return { url: uploadedFileUrl(key), mediaType: mediaTypeFromMime(file.type) };
}
