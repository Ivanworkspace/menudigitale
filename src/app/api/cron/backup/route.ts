import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminApp } from "@/server/firebase";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Daily managed export of the whole Firestore database to Cloud Storage
 * (BACKUP_BUCKET=gs://…). Requires the Blaze plan and a service account with
 * the "Cloud Datastore Import Export Admin" role on that bucket.
 * Restore: gcloud firestore import gs://…/<date>
 */
export async function GET(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || header.length !== expected.length || !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const bucket = process.env.BACKUP_BUCKET;
  if (!bucket) return NextResponse.json({ skipped: "BACKUP_BUCKET non impostato" });
  if (process.env.FIRESTORE_EMULATOR_HOST) return NextResponse.json({ skipped: "emulatore" });

  const app = adminApp();
  const projectId = app.options.projectId;
  const token = await app.options.credential!.getAccessToken();
  const prefix = `${bucket.replace(/\/$/, "")}/${new Date().toISOString().slice(0, 10)}`;
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ outputUriPrefix: prefix }),
  });
  const body = await res.json();
  if (!res.ok) return NextResponse.json({ error: body }, { status: 500 });
  return NextResponse.json({ ok: true, operation: body.name, outputUriPrefix: prefix });
}
