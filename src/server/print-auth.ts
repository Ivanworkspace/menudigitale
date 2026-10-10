import "server-only";
import type { NextRequest } from "next/server";
import { refs } from "@/server/db";
import { sha256 } from "@/server/crypto";

/** Authenticates the local print server by its per-venue key. */
export async function printServerTenant(req: NextRequest): Promise<string | null> {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(key)) return null;
  const snap = await refs.printKeys().doc(sha256(key)).get();
  return snap.exists ? (snap.get("tenantId") as string) : null;
}
