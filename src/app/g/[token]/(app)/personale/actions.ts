"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { hashPin } from "@/server/auth/pin";
import { isWeakPin } from "@/server/crypto";
import { revokeTenantSessions } from "@/server/auth/staff-session";
import { PERMISSIONS, STAFF_ROLES, type StaffRole } from "@/domain/permissions";
import type { StaffContext } from "@/server/auth/staff-session";

const MANAGE = { permission: "staff.manage" as const };

async function assertStaffLimit(ctx: StaffContext, excludingId?: string) {
  if (!ctx.tenant.planId) return;
  const max = (await refs.plans().doc(ctx.tenant.planId).get()).get("maxStaff") as number | null | undefined;
  if (max == null) return;
  const active = await refs.staff(ctx.tenant.id).where("active", "==", true).get();
  const count = active.docs.filter((d) => d.id !== excludingId).length;
  if (count >= max) throw new UserError(`Il tuo piano consente al massimo ${max} utenti attivi.`);
}

const staffSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().trim().min(1, "Inserisci il nome").max(40),
  role: z.enum(STAFF_ROLES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  pin: z.string().optional(),
});

export async function saveStaff(token: string, values: unknown) {
  return staffAction(token, MANAGE, async (ctx) => {
    const r = staffSchema.safeParse(values);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    const { id, pin, ...v } = r.data;
    const col = refs.staff(ctx.tenant.id);
    const before = id ? (await col.doc(id).get()).data() : null;
    if (id && !before) throw new UserError("Utente non trovato.");
    const touchingOwner = v.role === "owner" || before?.role === "owner";
    if (touchingOwner && ctx.staff.role !== "owner") throw new UserError("Solo il titolare può modificare il proprio profilo.");
    if (v.role === "owner" && before?.role !== "owner") throw new UserError("Il locale ha un solo titolare.");
    if (before?.role === "owner" && (v.role !== "owner" || !v.active)) throw new UserError("Il titolare non può essere disattivato o cambiare ruolo.");
    if (v.active && (!before || !before.active)) await assertStaffLimit(ctx, id);
    if (!id && !pin) throw new UserError("Imposta un PIN per il nuovo utente.");
    if (pin && (!/^\d{4,8}$/.test(pin) || isWeakPin(pin))) throw new UserError("PIN non valido: 4–8 cifre, non sequenze tipo 1234 o 0000.");

    let staffId = id;
    if (id) await col.doc(id).update({ ...v });
    else {
      const count = (await col.count().get()).data().count;
      staffId = (await col.add({ ...v, sort: count, lastLoginAt: null, createdAt: nowIso() })).id;
    }
    if (pin) {
      await refs.staffCredentials().doc(staffId!).set({ tenantId: ctx.tenant.id, pinHash: await hashPin(pin), pinUpdatedAt: nowIso() });
      if (id) await revokeTenantSessions(ctx.tenant.id, staffId);
    }
    if (id && before?.active && !v.active) await revokeTenantSessions(ctx.tenant.id, staffId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "staff.updated" : "staff.created", {
      entity: "staff",
      entityId: staffId,
      diff: { name: v.displayName, role: v.role, active: v.active, pinChanged: !!pin },
    });
    revalidatePath(`${ctx.basePath}/personale`);
  });
}

/** Role permission overrides (owner only). */
export async function savePermissions(token: string, role: StaffRole, allowed: string[]) {
  return staffAction(token, MANAGE, async (ctx) => {
    if (ctx.staff.role !== "owner") throw new UserError("Solo il titolare può modificare i permessi.");
    if (role === "owner" || !STAFF_ROLES.includes(role)) throw new UserError("Ruolo non valido.");
    const { DEFAULT_ROLE_PERMISSIONS } = await import("@/domain/permissions");
    const defaults = new Set<string>(DEFAULT_ROLE_PERMISSIONS[role]);
    const want = new Set(allowed.filter((p) => p in PERMISSIONS));
    const overrides: Record<string, boolean> = {};
    for (const p of Object.keys(PERMISSIONS)) {
      if (want.has(p) !== defaults.has(p)) overrides[p] = want.has(p);
    }
    await refs.rolePermissions(ctx.tenant.id).doc(role).set({ overrides });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "permissions.updated", { entity: "role", entityId: role, diff: overrides });
    revalidatePath(`${ctx.basePath}/personale`);
  });
}
