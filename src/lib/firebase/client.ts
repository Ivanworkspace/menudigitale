"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { publicEnv } from "@/lib/env";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function clientApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(publicEnv.firebase);
  return app;
}

/**
 * Auth with in-memory persistence: identities are short-lived custom tokens
 * minted by our server, never stored on shared restaurant devices.
 */
export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(clientApp());
    void setPersistence(auth, inMemoryPersistence);
    if (publicEnv.useEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function clientDb(): Firestore {
  if (!db) {
    db = getFirestore(clientApp());
    if (publicEnv.useEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return db;
}
