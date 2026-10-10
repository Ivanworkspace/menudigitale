"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { anonymizeCustomer, redeemReward, upsertCustomer } from "@/server/customers";
import { visibilitySchema } from "@/domain/menu-input";

const CUST = { permission: "customers.manage" as const, module: "loyalty" as const };

export async function saveCustomer(token: string, v: { id?: string; name: string; phone: string; email: string; birthday?: string; notes?: string; privacyConsent: boolean; marketingConsent: boolean }) {
  return staffAction(token, CUST, async (ctx) => {
    const id = await upsertCustomer(ctx.tenant.id, v);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), v.id ? "customer.updated" : "customer.created", { entity: "customer", entityId: id });
    revalidatePath(`${ctx.basePath}/clienti`, "layout");
    return { id };
  });
}

export async function redeem(token: string, customerId: string, rewardId: string) {
  return staffAction(token, CUST, async (ctx) => {
    await redeemReward(ctx.tenant, customerId, rewardId, ctx.staff.displayName);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "customer.reward_redeemed", { entity: "customer", entityId: customerId, diff: { rewardId } });
    revalidatePath(`${ctx.basePath}/clienti/${customerId}`);
  });
}

export async function anonymize(token: string, customerId: string) {
  return staffAction(token, CUST, async (ctx) => {
    await anonymizeCustomer(ctx.tenant.id, customerId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "customer.anonymized", { entity: "customer", entityId: customerId });
    revalidatePath(`${ctx.basePath}/clienti`, "layout");
  });
}

const loyaltySchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["points", "stamps"]),
  pointsPerEuro: z.number().min(0).max(100),
  stampMinCents: z.number().int().min(0).max(100_000),
  rewards: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), cost: z.number().int().min(1).max(100_000), description: z.string().max(200) })).max(30),
});

export async function saveLoyalty(token: string, v: unknown) {
  return staffAction(token, CUST, async (ctx) => {
    const r = loyaltySchema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    await refs.tenant(ctx.tenant.id).update({ "settings.loyalty": r.data, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "settings.loyalty_updated");
    revalidatePath(`${ctx.basePath}/clienti`, "layout");
  });
}

const promoSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["happy_hour", "code"]),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,20}$/, "Codice: 3–20 lettere/numeri")
    .nullable(),
  mode: z.enum(["percent", "amount"]),
  value: z.number().int().min(1).max(1_000_000),
  schedule: visibilitySchema,
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  maxUses: z.number().int().min(1).nullable(),
  minSpendCents: z.number().int().min(0),
  active: z.boolean(),
});

export async function savePromotion(token: string, v: unknown) {
  return staffAction(token, { ...CUST, permission: "discounts.apply" }, async (ctx) => {
    const r = promoSchema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    const { id, ...data } = r.data;
    if (data.kind === "code" && !data.code) throw new UserError("Inserisci il codice.");
    if (data.kind === "happy_hour") data.code = null;
    if (data.mode === "percent" && data.value > 10_000) throw new UserError("Percentuale non valida.");
    const col = refs.promotions(ctx.tenant.id);
    if (data.code) {
      const dup = await col.where("code", "==", data.code).get();
      if (dup.docs.some((d) => d.id !== id)) throw new UserError("Codice già esistente.");
    }
    if (id) await col.doc(id).update(data);
    else await col.add({ ...data, uses: 0, createdAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "promotion.updated" : "promotion.created", { diff: { name: data.name, code: data.code } });
    revalidatePath(`${ctx.basePath}/clienti/promozioni`);
  });
}

export async function deletePromotion(token: string, id: string) {
  return staffAction(token, { ...CUST, permission: "discounts.apply" }, async (ctx) => {
    await refs.promotions(ctx.tenant.id).doc(id).delete();
    revalidatePath(`${ctx.basePath}/clienti/promozioni`);
  });
}
