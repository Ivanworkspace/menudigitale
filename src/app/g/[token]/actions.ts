"use server";

import { redirect } from "next/navigation";
import { refs, nowIso } from "@/server/db";
import { verifyPin } from "@/server/auth/pin";
import { checkLockout, recordAttempt } from "@/server/auth/rate-limit";
import { endStaffSession, getStaffContext, startStaffSession } from "@/server/auth/staff-session";
import { mintStaffToken } from "@/server/auth/firebase-token";
import { resolveTenantByToken, tenantSubscription } from "@/server/tenancy/resolve";
import { clientIp } from "@/server/request";
import { logTenantAction } from "@/server/audit";
import { getAdminSession } from "@/server/auth/platform-admin";
import { PIN_LOCKOUT, TENANT_LOCKOUT, type LockoutState } from "@/domain/lockout";

const GENERIC = "PIN non corretto.";

function lockedMessage(s: LockoutState) {
  const minutes = s.until ? Math.max(1, Math.ceil((s.until.getTime() - Date.now()) / 60_000)) : 15;
  return `Troppi tentativi errati. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.`;
}

/**
 * Shared PIN login flow with lockout per (tenant, IP) and per tenant.
 * Returns an error message, or redirects on success.
 */
type PickedStaff = { id: string; role: string; displayName: string };

async function pinLogin(token: string, pin: string, pickStaff: (tenantId: string) => Promise<PickedStaff | null>, landing: "dashboard" | "titolare" = "dashboard") {
  if (!/^\d{4,8}$/.test(pin)) return GENERIC;
  const tenant = await resolveTenantByToken(token);
  if (!tenant) return GENERIC;

  const ip = await clientIp();
  const ipKey = `${tenant.id}:${ip}`;
  const [ipState, tenantState] = await Promise.all([
    checkLockout("pin", ipKey, PIN_LOCKOUT),
    checkLockout("pin_tenant", tenant.id, TENANT_LOCKOUT),
  ]);
  if (ipState.locked) return lockedMessage(ipState);
  if (tenantState.locked) return lockedMessage(tenantState);

  if (!tenantSubscription(tenant).accessAllowed) return "Il servizio per questo locale è sospeso. Contatta l'assistenza.";

  const staff = await pickStaff(tenant.id);
  let ok = false;
  if (staff) {
    const cred = (await refs.staffCredentials().doc(staff.id).get()).data();
    ok = !!cred && cred.tenantId === tenant.id && (await verifyPin(cred.pinHash, pin));
  }

  await Promise.all([
    recordAttempt("pin", ipKey, ok, tenant.id),
    recordAttempt("pin_tenant", tenant.id, ok, tenant.id),
  ]);

  if (!ok || !staff) {
    const remaining = ipState.remaining - 1;
    return remaining > 0 && remaining <= 3
      ? `${GENERIC} Ancora ${remaining} tentativ${remaining === 1 ? "o" : "i"}.`
      : remaining <= 0
        ? lockedMessage({ locked: true, until: new Date(Date.now() + PIN_LOCKOUT.lockMs), remaining: 0 })
        : GENERIC;
  }

  await startStaffSession({
    token,
    tenantId: tenant.id,
    staffId: staff.id,
    kind: staff.role === "owner" ? "owner" : "staff",
  });
  await logTenantAction(tenant.id, { kind: "staff", id: staff.id, name: staff.displayName }, "auth.login");
  redirect(`/g/${token}/${landing}`);
}

export async function loginOwner(token: string, pin: string, landing: "dashboard" | "titolare" = "dashboard"): Promise<string | null> {
  return pinLogin(token, pin, async (tenantId) => {
    const snap = await refs.staff(tenantId).where("role", "==", "owner").where("active", "==", true).limit(1).get();
    const d = snap.docs[0];
    return d ? { id: d.id, role: "owner", displayName: d.get("displayName") } : null;
  }, landing === "titolare" ? "titolare" : "dashboard");
}

export async function loginStaff(token: string, staffId: string, pin: string): Promise<string | null> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(staffId)) return GENERIC;
  return pinLogin(token, pin, async (tenantId) => {
    const d = await refs.staff(tenantId).doc(staffId).get();
    return d.exists && d.get("active") ? { id: d.id, role: d.get("role"), displayName: d.get("displayName") } : null;
  });
}

export async function logout(token: string) {
  const ctx = await getStaffContext(token);
  if (ctx) {
    await logTenantAction(
      ctx.tenant.id,
      { kind: "staff", id: ctx.staff.id, name: ctx.staff.displayName, impersonatedBy: ctx.impersonatedBy },
      ctx.kind === "impersonation" ? "impersonation.ended" : "auth.logout",
    );
    if (ctx.kind === "impersonation" && ctx.impersonatedBy) {
      const open = await refs
        .impersonations()
        .where("tenantId", "==", ctx.tenant.id)
        .where("adminId", "==", ctx.impersonatedBy)
        .where("endedAt", "==", null)
        .get();
      await Promise.all(open.docs.map((d) => d.ref.update({ endedAt: nowIso() })));
    }
  }
  await endStaffSession(token);
  if (ctx?.kind === "impersonation") {
    // Back to the super admin panel if that session is still valid.
    if ((await getAdminSession())?.data.mfa) redirect(`/superadmin/clienti/${ctx.tenant.id}`);
  }
  redirect(`/g/${token}`);
}

/** Firebase custom token so the browser can open realtime listeners. */
export async function getRealtimeToken(token: string): Promise<string | null> {
  const ctx = await getStaffContext(token);
  if (!ctx) return null;
  return mintStaffToken({ staffId: ctx.staff.id, tenantId: ctx.tenant.id, role: ctx.staff.role, sessionId: ctx.sessionId });
}
