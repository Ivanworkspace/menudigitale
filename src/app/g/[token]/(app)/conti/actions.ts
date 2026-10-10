"use server";

import { revalidatePath } from "next/cache";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import {
  addAdjustment,
  addPayment,
  clearParts,
  closeBill,
  openBill,
  removeAdjustment,
  removePayment,
  setBillCovers,
  setService,
  splitBySelection,
  splitEqual,
} from "@/server/billing/service";
import { PAYMENT_LABELS, type PaymentMethod } from "@/domain/billing";

const BILLS = { permission: "bills.manage" as const, module: "billing" as const };

export async function refreshBill(token: string, sessionId: string) {
  return staffAction(token, BILLS, async (ctx) => openBill(ctx.tenant, sessionId));
}

export async function applyAdjustment(token: string, billId: string, a: { kind: "discount" | "surcharge"; mode: "percent" | "amount"; value: number; reason: string }) {
  return staffAction(token, { ...BILLS }, async (ctx) => {
    if (!ctx.permissions.has("discounts.apply")) throw new UserError("Non hai il permesso di applicare sconti o maggiorazioni.");
    if (!a.reason?.trim()) throw new UserError("Indica il motivo.");
    const b = await addAdjustment(ctx.tenant.id, billId, { ...a, reason: a.reason.trim().slice(0, 80) });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), `bill.${a.kind}_applied`, { entity: "bill", entityId: billId, diff: a });
    return b;
  });
}

export async function deleteAdjustment(token: string, billId: string, id: string) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!ctx.permissions.has("discounts.apply")) throw new UserError("Permesso negato.");
    return removeAdjustment(ctx.tenant.id, billId, id);
  });
}

export async function updateCovers(token: string, billId: string, sessionId: string, covers: number, children: number) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!(covers >= 0 && covers <= 99 && children >= 0 && children <= 99)) throw new UserError("Coperti non validi.");
    return setBillCovers(ctx.tenant.id, billId, sessionId, Math.floor(covers), Math.floor(children));
  });
}

export async function updateCharges(token: string, billId: string, servicePctBp: number, coverChargeCents: number) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!ctx.permissions.has("discounts.apply")) throw new UserError("Permesso negato.");
    return setService(ctx.tenant.id, billId, Math.max(0, Math.min(3000, servicePctBp)), Math.max(0, coverChargeCents));
  });
}

export async function romanSplit(token: string, billId: string, n: number) {
  return staffAction(token, BILLS, async (ctx) => splitEqual(ctx.tenant.id, billId, n));
}

export async function itemsSplit(token: string, billId: string, label: string, selection: Record<string, number>, persons: number) {
  return staffAction(token, BILLS, async (ctx) => splitBySelection(ctx.tenant.id, billId, label, selection, Math.max(0, persons)));
}

export async function resetSplit(token: string, billId: string) {
  return staffAction(token, BILLS, async (ctx) => clearParts(ctx.tenant.id, billId));
}

export async function pay(token: string, billId: string, p: { method: PaymentMethod; amountCents: number; tenderedCents?: number | null; partId?: string | null }) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!(p.method in PAYMENT_LABELS)) throw new UserError("Metodo non valido.");
    const b = await addPayment(ctx.tenant.id, billId, { ...p, by: ctx.staff.displayName });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "bill.payment_added", { entity: "bill", entityId: billId, diff: { method: p.method, amount: p.amountCents } });
    return b;
  });
}

export async function deletePayment(token: string, billId: string, paymentId: string) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!ctx.permissions.has("discounts.apply")) throw new UserError("Solo un responsabile può annullare un pagamento.");
    const b = await removePayment(ctx.tenant.id, billId, paymentId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "bill.payment_removed", { entity: "bill", entityId: billId, diff: { paymentId } });
    return b;
  });
}

export async function finalizeBill(token: string, billId: string) {
  return staffAction(token, BILLS, async (ctx) => {
    await closeBill(ctx.tenant, billId, ctx.staff.displayName);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "bill.closed", { entity: "bill", entityId: billId });
    revalidatePath(`${ctx.basePath}/conti`);
  });
}


export async function findCustomers(token: string, q: string) {
  return staffAction(token, { ...BILLS }, async (ctx) => {
    const { refs } = await import("@/server/db");
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const key = /^\+?\d[\d\s]{4,}$/.test(needle) ? needle.replace(/\D/g, "").slice(-6) : needle.slice(0, 12);
    const snap = await refs.customers(ctx.tenant.id).where("searchKeys", "array-contains", key).limit(8).get();
    return snap.docs.map((d) => ({ id: d.id, name: d.get("name") as string, phone: (d.get("phone") as string | null) ?? null, points: (d.get("points") as number) ?? 0 }));
  });
}

export async function attachCustomer(token: string, billId: string, customerId: string | null) {
  return staffAction(token, BILLS, async (ctx) => {
    const { setBillCustomer } = await import("@/server/billing/service");
    return setBillCustomer(ctx.tenant.id, billId, customerId);
  });
}

export async function applyPromoCode(token: string, billId: string, code: string) {
  return staffAction(token, BILLS, async (ctx) => {
    if (!ctx.modules.loyalty) throw new UserError("Modulo Clienti e fidelity non attivo.");
    const { applyPromotion } = await import("@/server/billing/service");
    const b = await applyPromotion(ctx.tenant, billId, { code });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "bill.promo_applied", { entity: "bill", entityId: billId, diff: { code } });
    return b;
  });
}
