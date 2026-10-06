import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHUNK_SIZE, chunkKey, type UploadManifest } from "../utils-worker/upload";

// Copies the Express app's Prisma SQLite data (and its uploads directory)
// into the Worker's D1 database and KV namespace, via wrangler.
//
//   tsx src/db/import-from-prisma.ts <prisma.db> <uploadsDir> -- <wrangler target flags>
//   e.g. ... prisma/dev.db ../uploads -- --remote
//        ... prisma/e2e.db tests-tmp/e2e-uploads -- --local --persist-to .wrangler/e2e
//
// The source DB is opened read-only. Target D1 must be freshly migrated and
// empty (ids are copied as-is). Prisma stores DateTime as epoch milliseconds;
// the Drizzle schema uses epoch seconds.

const TABLES: { name: string; dateColumns: string[] }[] = [
  { name: "User", dateColumns: ["createdAt", "totpConfirmedAt"] },
  { name: "Project", dateColumns: ["createdAt"] },
  { name: "Unit", dateColumns: ["createdAt"] },
  { name: "Phase", dateColumns: ["createdAt"] },
  { name: "SubPhase", dateColumns: ["createdAt"] },
  { name: "PhaseAssignment", dateColumns: ["createdAt"] },
  { name: "ProjectParticipant", dateColumns: ["createdAt"] },
  { name: "Update", dateColumns: ["timestamp"] },
  { name: "FinancialRecord", dateColumns: ["timestamp"] },
];

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function toEpochSeconds(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Math.floor(value / 1000);
  const parsed = Date.parse(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed)) throw new Error(`Unparseable date: ${value}`);
  return Math.floor(parsed / 1000);
}

function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readTable(dbPath: string, table: string): Record<string, unknown>[] {
  const out = execFileSync("sqlite3", ["-readonly", "-json", dbPath, `SELECT * FROM "${table}" ORDER BY id`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.trim() ? JSON.parse(out) : [];
}

function wrangler(args: string[]) {
  execFileSync("npx", ["wrangler", ...args], { stdio: "inherit" });
}

const sep = process.argv.indexOf("--");
const [dbPath, uploadsDir] = process.argv.slice(2, sep === -1 ? undefined : sep);
const targetFlags = sep === -1 ? [] : process.argv.slice(sep + 1);
if (!dbPath || !uploadsDir || targetFlags.length === 0) {
  console.error("usage: import-from-prisma.ts <prisma.db> <uploadsDir> -- <wrangler target flags>");
  process.exit(1);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "d1-import-"));
try {
  const statements = ["PRAGMA defer_foreign_keys = true;"];
  for (const { name, dateColumns } of TABLES) {
    const rows = readTable(dbPath, name);
    for (const row of rows) {
      for (const col of dateColumns) row[col] = toEpochSeconds(row[col]);
      const cols = Object.keys(row);
      statements.push(
        `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c) => sqlLiteral(row[c])).join(", ")});`
      );
    }
    console.log(`${name}: ${rows.length} rows`);
  }
  const sqlFile = path.join(workDir, "import.sql");
  fs.writeFileSync(sqlFile, statements.join("\n"));
  wrangler(["d1", "execute", "DB", "--file", sqlFile, ...targetFlags]);

  const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).filter((f) => !f.startsWith(".")) : [];
  for (const file of files) {
    const data = fs.readFileSync(path.join(uploadsDir, file));
    const contentType = MIME_BY_EXT[path.extname(file).toLowerCase()];
    if (!contentType) throw new Error(`No known content type for ${file}`);
    const chunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE));
    for (let i = 0; i < chunks; i++) {
      const chunkFile = path.join(workDir, "chunk");
      fs.writeFileSync(chunkFile, data.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      wrangler(["kv", "key", "put", chunkKey(file, i), "--path", chunkFile, "--binding", "UPLOADS_KV", ...targetFlags]);
    }
    const manifest: UploadManifest = { contentType, size: data.length, chunkSize: CHUNK_SIZE, chunks };
    wrangler(["kv", "key", "put", file, JSON.stringify(manifest), "--binding", "UPLOADS_KV", ...targetFlags]);
    console.log(`upload ${file}: ${data.length} bytes, ${chunks} chunk(s)`);
  }
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
