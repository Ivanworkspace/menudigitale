import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PIN_REGEX = /^\d{4,8}$/;

export function hashPin(pin: string): Promise<string> {
  return hash(pin, OPTS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  try {
    return await verify(pinHash, pin);
  } catch {
    return false;
  }
}
