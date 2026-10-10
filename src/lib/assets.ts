import { publicEnv } from "@/lib/env";

/** Public URL of a Storage object (public read is allowed by storage.rules). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const bucket = publicEnv.firebase.storageBucket;
  const host = publicEnv.useEmulators ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

/** Thumbnail URL for images stored with a "_t" variant (product photos). */
export function thumbUrl(path: string | null | undefined): string | null {
  return path ? assetUrl(path.replace(/\.webp$/, "_t.webp")) : null;
}
