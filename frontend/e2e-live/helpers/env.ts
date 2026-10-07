import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LiveEnv {
  LIVE_BASE_URL: string;
  LIVE_QA_ADMIN_EMAIL: string;
  LIVE_QA_ADMIN_PASSWORD: string;
  LIVE_QA_ADMIN_TOTP_SECRET: string;
}

const KEYS: (keyof LiveEnv)[] = [
  "LIVE_BASE_URL",
  "LIVE_QA_ADMIN_EMAIL",
  "LIVE_QA_ADMIN_PASSWORD",
  "LIVE_QA_ADMIN_TOTP_SECRET",
];

const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");

// Tiny KEY=VALUE parser (no dotenv dependency). Values are never logged.
export function loadLiveEnv(): LiveEnv {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error("Live QA suite refuses to run: frontend/e2e-live/.env is missing");
  }
  const parsed: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    parsed[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  const missing = KEYS.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error(`Live QA suite refuses to run: missing keys in e2e-live/.env: ${missing.join(", ")}`);
  }
  if (!/^https:\/\//.test(parsed.LIVE_BASE_URL)) {
    throw new Error("Live QA suite refuses to run: LIVE_BASE_URL must be an https:// URL");
  }
  return { ...(parsed as unknown as LiveEnv), LIVE_BASE_URL: parsed.LIVE_BASE_URL.replace(/\/+$/, "") };
}
