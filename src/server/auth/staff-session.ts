import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { refs, nowIso, expireIn, allWithId, withId } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { clientIp, userAgent } from "@/server/request";
import { resolveTenantByToken, tenantSubscription } from "@/server/tenancy/resolve";
import { resolvePermissions, type Permission, type StaffRole, type PermissionOverride } from "@/domain/permissions";
import type { ModuleFlags } from "@/domain/modules";
import type { StaffMember, Tenant } from "@/server/db/types";

export const STAFF_COOKIE = "gs";
type Kind = "owner" | "staff" | "impersonation";
const TTL_MS: Record<Kind, number> = { owner: 12 * 3600_000, staff: 12 * 3600_000, impersonation: 3600_000 };

export type StaffContext = {
  tenant: Tenant;
  staff: StaffMember;
  sessionId: string;
  kind: Kind;
  impersonatedBy: string | null;
  modules: ModuleFlags;
  permissions: Set<Permission>;
  basePath: string;
};

export function cookieOptions(token: string, maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: `/g/${token}`,
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** Creates a session document and sets the path-scoped cookie. */
export async function startStaffSession(opts: {
  token: string;
  tenantId: string;
  staffId: string;
  kind: Kind;
  impersonatedBy?: string;
}) {
  const raw = randomToken();
  const ttl = TTL_MS[opts.kind];
  const now = nowIso();
  await refs.staffSessions().doc(sha256(raw)).set({
    tenantId: opts.tenantId,
    staffId: opts.staffId,
    kind: opts.kind,
    ip: await clientIp(),
    userAgent: await userAgent(),
    impersonatedBy: opts.impersonatedBy ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
    expireAt: expireIn(ttl + 86_400_000),
    revokedAt: null,
  });
  if (opts.kind !== "impersonation") await refs.staff(opts.tenantId).doc(opts.staffId).update({ lastLoginAt: now });
  await refs.tenant(opts.tenantId).update({ lastActivityAt: now });
  (await cookies()).set(STAFF_COOKIE, raw, cookieOptions(opts.token, ttl));
}

export async function endStaffSession(token: string) {
  const store = await cookies();
  const raw = store.get(STAFF_COOKIE)?.value;
  if (raw) await refs.staffSessions().doc(sha256(raw)).set({ revokedAt: nowIso() }, { merge: true });
  store.set(STAFF_COOKIE, "", { ...cookieOptions(token, 0), maxAge: 0 });
}

/** Revokes every open session of a tenant (optionally of one staff member). */
export async function revokeTenantSessions(tenantId: string, staffId?: string) {
  let q = refs.staffSessions().where("tenantId", "==", tenantId).where("revokedAt", "==", null);
  if (staffId) q = q.where("staffId", "==", staffId);
  const snap = await q.get();
  const now = nowIso();
  const batch = refs.staffSessions().firestore.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { revokedAt: now }));
  if (!snap.empty) await batch.commit();
}

export async function loadPermissions(tenantId: string, role: StaffRole): Promise<Set<Permission>> {
  const snap = await refs.rolePermissions(tenantId).get();
  const overrides: PermissionOverride[] = [];
  for (const d of snap.docs) {
    for (const [permission, allowed] of Object.entries((d.get("overrides") ?? {}) as Record<string, boolean>)) {
      overrides.push({ role: d.id as StaffRole, permission, allowed });
    }
  }
  return resolvePermissions(role, overrides);
}

/**
 * Resolves the current staff context for /g/[token]/*. Returns null when the
 * session is missing, expired, revoked, the staff member was deactivated, or
 * the tenant may not operate (except for support impersonation).
 */
export const getStaffContext = cache(async (token: string): Promise<StaffContext | null> => {
  const tenant = await resolveTenantByToken(token);
  if (!tenant) return null;
  const raw = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!raw) return null;

  const sessionRef = refs.staffSessions().doc(sha256(raw));
  const session = (await sessionRef.get()).data();
  if (!session || session.tenantId !== tenant.id || session.revokedAt) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  if (!tenantSubscription(tenant).accessAllowed && session.kind !== "impersonation") return null;

  const staff = withId<StaffMember>(await refs.staff(tenant.id).doc(session.staffId).get());
  if (!staff || !staff.active) return null;

  if (Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60_000) {
    const now = nowIso();
    await Promise.all([sessionRef.update({ lastSeenAt: now }), refs.tenant(tenant.id).update({ lastActivityAt: now })]);
  }

  return {
    tenant,
    staff: { ...staff, tenantId: tenant.id },
    sessionId: sessionRef.id,
    kind: session.kind,
    impersonatedBy: session.impersonatedBy ?? null,
    modules: tenant.modules,
    permissions: await loadPermissions(tenant.id, staff.role),
    basePath: `/g/${token}`,
  };
});

export async function listActiveStaff(tenantId: string): Promise<StaffMember[]> {
  const snap = await refs.staff(tenantId).where("active", "==", true).get();
  return allWithId<StaffMember>(snap).sort((a, b) => a.sort - b.sort || a.displayName.localeCompare(b.displayName));
}
