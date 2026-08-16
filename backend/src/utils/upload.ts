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
]);

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("Unsupported file type");
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new UnsupportedFileTypeError());
      return;
    }
    cb(null, true);
  },
});

export function mediaTypeFromMime(mimetype: string): "IMAGE" | "VIDEO" {
  return mimetype.startsWith("video/") ? "VIDEO" : "IMAGE";
}

export function publicUploadPath(filename: string): string {
  return `/uploads/${filename}`;
}
