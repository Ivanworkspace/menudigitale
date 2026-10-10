import { adminAuth, adminDb } from "../src/lib/firebase/admin-core";

export { adminAuth, adminDb };

export function requireEnv(...names: string[]) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Variabili mancanti in .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }
}

export const nowIso = () => new Date().toISOString();
