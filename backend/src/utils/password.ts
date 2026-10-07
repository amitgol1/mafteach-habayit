import bcrypt from "bcryptjs";

// PBKDF2 via Web Crypto (native in both Node and Workers) instead of bcryptjs:
// a pure-JS bcrypt compare costs ~50ms CPU, over the Cloudflare free plan's
// 10ms-per-request limit, and bursts of logins got 503 "exceeded resource
// limits". 50k iterations is ~4ms. Accounts are also behind mandatory TOTP.
// Legacy bcrypt hashes still verify; callers re-hash them on successful login
// (see needsRehash).
const ITERATIONS = 50_000;
const PREFIX = "pbkdf2-sha256";

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(`${PREFIX}$`)) {
    return bcrypt.compare(password, stored);
  }
  const [, iterations, salt, expected] = stored.split("$");
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  const expectedBytes = fromBase64(expected);
  if (actual.length !== expectedBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expectedBytes[i];
  return diff === 0;
}

export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${PREFIX}$${ITERATIONS}$`);
}
