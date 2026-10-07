import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Replaces the dev environment's D1 + KV with a copy of production's
// (`npm run copy:prod-to-dev`). Production is only ever read: every write
// below carries `--env dev`.

const DEV = ["--env", "dev"];

function wrangler(args: string[], opts: { capture?: boolean } = {}): string {
  const out = execFileSync("npx", ["wrangler", ...args], {
    stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 256 * 1024 * 1024,
  });
  return opts.capture ? out.toString("utf8") : "";
}

function d1Json<T>(args: string[]): T[] {
  const out = wrangler(["d1", "execute", "DB", "--remote", "--json", ...args], { capture: true });
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

function kvKeys(envArgs: string[]): string[] {
  const out = wrangler(["kv", "key", "list", "--binding", "UPLOADS_KV", "--remote", ...envArgs], { capture: true });
  return (JSON.parse(out) as { name: string }[]).map((k) => k.name);
}

// Parents before children: D1 runs a --file in more than one transaction, so
// deferred FK checks fire before a later chunk's parent rows arrive. Rows of
// sqlite_sequence are dropped — SQLite maintains it from the explicit ids.
const INSERT_ORDER = [
  "User",
  "Project",
  "Unit",
  "Phase",
  "SubPhase",
  "PhaseAssignment",
  "ProjectParticipant",
  "Update",
  "FinancialRecord",
  "d1_migrations",
];

function orderInserts(sql: string): string {
  const byTable = new Map<string, string[]>(INSERT_ORDER.map((t) => [t, []]));
  for (const line of sql.split("\n")) {
    const table = /^INSERT INTO "([^"]+)"/.exec(line)?.[1];
    if (!table || table === "sqlite_sequence") continue;
    const rows = byTable.get(table);
    if (!rows) throw new Error(`Unknown table in export: ${table} — add it to INSERT_ORDER`);
    rows.push(line);
  }
  return ["PRAGMA defer_foreign_keys = true;", ...INSERT_ORDER.flatMap((t) => byTable.get(t)!)].join("\n");
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "prod-to-dev-"));
try {
  // Schema and data as two files: D1's export orders tables alphabetically,
  // and SQLite rejects an INSERT whose FK parent table doesn't exist yet even
  // with deferred FK checks.
  const schema = path.join(workDir, "schema.sql");
  const data = path.join(workDir, "data.sql");
  wrangler(["d1", "export", "DB", "--remote", "--no-data", "--output", schema]);
  wrangler(["d1", "export", "DB", "--remote", "--no-schema", "--output", data]);
  fs.writeFileSync(data, orderInserts(fs.readFileSync(data, "utf8")));

  const devTables = d1Json<{ name: string }>([
    ...DEV,
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  ]).map((t) => t.name);
  if (devTables.length > 0) {
    const drop = path.join(workDir, "drop.sql");
    fs.writeFileSync(
      drop,
      [
        "PRAGMA defer_foreign_keys = true;",
        ...[
          ...[...INSERT_ORDER].reverse().filter((t) => devTables.includes(t)),
          ...devTables.filter((t) => !INSERT_ORDER.includes(t)),
        ].map((t) => `DROP TABLE IF EXISTS "${t}";`),
      ].join("\n")
    );
    wrangler(["d1", "execute", "DB", "--remote", ...DEV, "--file", drop]);
  }
  wrangler(["d1", "execute", "DB", "--remote", ...DEV, "--file", schema]);
  wrangler(["d1", "execute", "DB", "--remote", ...DEV, "--file", data]);

  const prodKeys = kvKeys([]);
  const staleDevKeys = kvKeys(DEV).filter((k) => !prodKeys.includes(k));
  for (const key of staleDevKeys) {
    wrangler(["kv", "key", "delete", key, "--binding", "UPLOADS_KV", "--remote", ...DEV]);
  }
  const valueFile = path.join(workDir, "value");
  for (const key of prodKeys) {
    const value = execFileSync("npx", ["wrangler", "kv", "key", "get", key, "--binding", "UPLOADS_KV", "--remote"], {
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(valueFile, value);
    wrangler(["kv", "key", "put", key, "--path", valueFile, "--binding", "UPLOADS_KV", "--remote", ...DEV]);
  }
  console.log(`Copied D1 and ${prodKeys.length} KV keys (removed ${staleDevKeys.length} stale) from production to dev.`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
