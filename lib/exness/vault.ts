import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ExnessCredentials } from "./client";
function key() {
  const secret = process.env.EXNESS_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("Set EXNESS_CREDENTIALS_ENCRYPTION_KEY to a random secret of at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}
export function encryptExnessCredentials(value: ExnessCredentials) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decryptExnessCredentials(value: string): ExnessCredentials {
  const packed = Buffer.from(value, "base64url"); if (packed.length < 29) throw new Error("Stored Exness credentials are invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12)); decipher.setAuthTag(packed.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as ExnessCredentials;
}
