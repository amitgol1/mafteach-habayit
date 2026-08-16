import fs from "fs";
import multer from "multer";
import path from "path";

export const uploadsRoot = path.resolve(process.cwd(), process.env.UPLOADS_DIR || "../uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

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

const mimeTypeFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(new UnsupportedFileTypeError());
    return;
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: mimeTypeFilter,
});

export const uploadUpdateMedia = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: mimeTypeFilter,
});

export function mediaTypeFromMime(mimetype: string): "IMAGE" | "VIDEO" | "DOCUMENT" {
  if (mimetype.startsWith("video/")) return "VIDEO";
  if (documentMimeTypes.has(mimetype)) return "DOCUMENT";
  return "IMAGE";
}

export function publicUploadPath(filename: string): string {
  return `/uploads/${filename}`;
}
