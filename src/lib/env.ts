import { z } from "zod";

/** Public env (safe in the browser). */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? "MenuSaaS",
  useEmulators: process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
};

const serverSchema = z.object({
  APP_ENCRYPTION_KEY: z.string().min(40), // base64 of 32 bytes
  CRON_SECRET: z.string().min(16).optional(),
});

let cached: z.infer<typeof serverSchema> | null = null;

/** Server-only secrets, validated lazily so builds don't need them. */
export function serverEnv() {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        "Variabili d'ambiente mancanti o non valide: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "),
      );
    }
    cached = parsed.data;
  }
  return cached;
}
