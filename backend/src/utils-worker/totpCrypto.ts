import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Port of src/utils/totpCrypto.ts. Same AES-256-GCM format
// (iv:authTag:ciphertext, hex), so secrets copied from the Express DB decrypt
// here given the same TOTP_ENCRYPTION_KEY. The key is a parameter because the
// Worker reads it from its env binding, not process.env.
const ALGORITHM = "aes-256-gcm";

export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(keyHex, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Buffer.from: workerd's types for randomBytes/getAuthTag return a plain
  // Uint8Array-like whose toString() takes no encoding.
  return `${Buffer.from(iv).toString("hex")}:${Buffer.from(authTag).toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(ciphertext: string, keyHex: string): string {
  const [ivHex, authTagHex, dataHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}
