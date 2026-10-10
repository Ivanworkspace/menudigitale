/**
 * Framework-free crypto helpers (shared by server code and CLI scripts).
 * Node-only: never import from client components.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  return "0123456789012345".includes(pin) || "9876543210987654".includes(pin);
}

/** Numeric PIN avoiding trivial sequences (0000, 1234, …). */
export function generatePin(length = 6): string {
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(0, 10)).join("");
    if (!isWeakPin(pin)) return pin;
  }
}

function parseKey(base64Key: string): Buffer {
  const k = Buffer.from(base64Key, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY deve essere 32 byte in base64");
  return k;
}

/** AES-256-GCM; output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encryptWithKey(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(base64Key), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decryptWithKey(payload: string, base64Key: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", parseKey(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
