import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refs, nowIso, expireIn } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { clientIp, userAgent } from "@/server/request";

/**
 * Super admin authentication:
 *  1. Firebase Auth email/password in the browser -> ID token
 *  2. server verifies the ID token and the platform_admins document and opens
 *     a session with mfa=false
 *  3. TOTP verification (our own RFC 6238 implementation) flips mfa=true
 * Only sessions with mfa=true can reach /superadmin pages and actions.
 */
export const ADMIN_COOKIE = "sa";
const SESSION_TTL = 8 * 3600_000;
const PENDING_TTL = 10 * 60_000;

export type PlatformAdmin = { userId: string; email: string; displayName: string; sessionId: string };

function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/superadmin",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export async function openAdminSession(uid: string, email: string) {
  const raw = randomToken();
  await refs.adminSessions().doc(sha256(raw)).set({
    uid,
    email,
    mfa: false,
    pendingSecretEnc: null,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + PENDING_TTL).toISOString(),
    expireAt: expireIn(SESSION_TTL + 86_400_000),
    ip: await clientIp(),
    userAgent: await userAgent(),
    revokedAt: null,
  });
  (await cookies()).set(ADMIN_COOKIE, raw, cookieOpts(SESSION_TTL));
}

/** Current session document (pending or complete), or null. */
export async function getAdminSession() {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  const ref = refs.adminSessions().doc(sha256(raw));
  const data = (await ref.get()).data();
  if (!data || data.revokedAt || new Date(data.expiresAt) < new Date()) return null;
  return { ref, data };
}

export async function completeMfa(sessionRef: FirebaseFirestore.DocumentReference) {
  await sessionRef.update({
    mfa: true,
    pendingSecretEnc: null,
    expiresAt: new Date(Date.now() + SESSION_TTL).toISOString(),
  });
}

export async function closeAdminSession() {
  const s = await getAdminSession();
  if (s) await s.ref.update({ revokedAt: nowIso() });
  (await cookies()).set(ADMIN_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
}

/** Guards every /superadmin page and action. */
export const requirePlatformAdmin = cache(async (): Promise<PlatformAdmin> => {
  const s = await getAdminSession();
  if (!s) redirect("/superadmin/login");
  if (!s.data.mfa) redirect("/superadmin/mfa");
  const admin = (await refs.platformAdmins().doc(s.data.uid).get()).data();
  if (!admin || admin.disabled) redirect("/superadmin/login?error=forbidden");
  return { userId: s.data.uid, email: s.data.email, displayName: admin.displayName, sessionId: s.ref.id };
});
