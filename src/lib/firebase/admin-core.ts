/**
 * Firebase Admin SDK bootstrap (no "server-only" marker so CLI scripts can
 * reuse it). The Admin SDK bypasses security rules: every caller must
 * authorize first and always scope queries to a tenant.
 *
 * Credentials, in order of preference:
 *  - FIREBASE_SERVICE_ACCOUNT_BASE64: base64 of the service-account JSON
 *  - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  - emulators (FIRESTORE_EMULATOR_HOST set): no credentials needed
 *  - Application Default Credentials (GCP environments)
 */
import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

let app: App | undefined;
let firestore: Firestore | undefined;

function projectId() {
  return process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
}

export function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    app = initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket });
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: projectId(),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId: projectId(),
      storageBucket,
    });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: projectId(), storageBucket });
  } else {
    app = initializeApp({ credential: applicationDefault(), projectId: projectId(), storageBucket });
  }
  return app;
}

export function adminDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    // The same Firestore instance can be shared by several bundles (RSC,
    // server actions, route handlers): settings() may only be applied once.
    const g = globalThis as { __firestoreConfigured?: boolean };
    if (!g.__firestoreConfigured) {
      try {
        firestore.settings({ ignoreUndefinedProperties: true });
      } catch {
        // already configured by another bundle
      }
      g.__firestoreConfigured = true;
    }
  }
  return firestore;
}

export const adminAuth = () => getAuth(adminApp());
export const adminBucket = () => getStorage(adminApp()).bucket();
