import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Guest (table) binding: an httpOnly cookie, scoped to /m/<slug>, holding a
 * signed claim "this device joined table session S". When the bill is
 * closed, S no longer matches the table's session → old QR photos fail.
 */
export const GUEST_COOKIE = "gt";
const TTL_S = 8 * 3600;

export type GuestClaims = { tenantId: string; tableId: string; sessionId: string; deviceId: string; codeOk: boolean };

function key() {
  return createHash("sha256").update(`guest:${serverEnv().APP_ENCRYPTION_KEY}`).digest();
}

export async function setGuestCookie(slug: string, c: GuestClaims) {
  const jwt = await new SignJWT({ t: c.tenantId, tb: c.tableId, s: c.sessionId, d: c.deviceId, c: c.codeOk })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_S}s`)
    .sign(key());
  (await cookies()).set(GUEST_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/m/${slug}`,
    maxAge: TTL_S,
  });
}

export async function readGuestCookie(): Promise<GuestClaims | null> {
  const raw = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, key());
    return {
      tenantId: String(payload.t),
      tableId: String(payload.tb),
      sessionId: String(payload.s),
      deviceId: String(payload.d),
      codeOk: payload.c === true,
    };
  } catch {
    return null;
  }
}
