"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin, closeAdminSession } from "@/server/auth/platform-admin";
import { refs, db, nowIso } from "@/server/db";
import { decrypt, encrypt, generatePin, randomToken, sha256 } from "@/server/crypto";
import { hashPin } from "@/server/auth/pin";
import { revokeTenantSessions, startStaffSession } from "@/server/auth/staff-session";
import { logPlatformAction, logTenantAction } from "@/server/audit";
import { storeTenantImage, removeTenantImage } from "@/server/images";
import { createTenantSchema, tenantDetailsSchema, FONT_OPTIONS } from "@/domain/tenant-input";
import { validateSlug } from "@/domain/slug";
import { MODULE_KEYS, type ModuleFlags } from "@/domain/modules";
import { publicEnv } from "@/lib/env";
import { romeEndOfDay } from "@/lib/format";
import { DEFAULT_BRANDING, DEFAULT_SETTINGS, type Tenant } from "@/server/db/types";
import { currentMonth } from "@/server/superadmin/queries";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T,>(data: T): { ok: true; data: T } => ({ ok: true, data });
const managementLink = (token: string) => `${publicEnv.appUrl}/g/${token}`;
const ASSISTANCE = (id: string) => ({ kind: "platform_admin" as const, id, name: "Assistenza" });

function newAccessToken() {
  const token = randomToken(32);
  return { token, hash: sha256(token), enc: encrypt(token), hint: token.slice(-4) };
}

async function accessTokenDoc(tenantId: string) {
  const snap = await refs.accessTokens().where("tenantId", "==", tenantId).limit(1).get();
  return snap.docs[0] ?? null;
}

// ---------------------------------------------------------------------------
// Tenant creation
// ---------------------------------------------------------------------------

export async function checkSlug(slug: string): Promise<{ available: boolean; error: string | null }> {
  await requirePlatformAdmin();
  const err = validateSlug(slug);
  if (err) return { available: false, error: err };
  const taken = (await refs.slugs().doc(slug).get()).exists;
  return { available: !taken, error: taken ? "Indirizzo già in uso." : null };
}

export async function createTenant(
  formData: FormData,
): Promise<ActionResult<{ tenantId: string; link: string; pin: string; slug: string }>> {
  const admin = await requirePlatformAdmin();
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload")));
  } catch {
    return fail("Dati non validi.");
  }
  const parsed = createTenantSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const input = parsed.data;

  const access = newAccessToken();
  const pin = generatePin(6);
  const pinHash = await hashPin(pin);
  const now = nowIso();
  const tenantRef = refs.tenants().doc();
  const ownerRef = refs.staff(tenantRef.id).doc();
  const modules = Object.fromEntries(MODULE_KEYS.map((m) => [m, input.modules.includes(m)])) as ModuleFlags;

  const tenant: Omit<Tenant, "id"> = {
    slug: input.slug,
    status: input.status,
    planId: input.planId,
    legalName: input.legalName,
    displayName: input.displayName,
    vatNumber: input.vatNumber,
    address: input.address,
    city: input.city,
    postalCode: input.postalCode,
    province: input.province,
    phone: input.phone,
    email: input.email,
    contactName: input.contactName,
    lat: input.lat,
    lng: input.lng,
    geofenceRadiusM: input.geofenceRadiusM,
    defaultMenuMode: input.defaultMenuMode,
    trialEndsAt: input.status === "trial" ? new Date(Date.now() + input.trialDays * 86_400_000).toISOString() : null,
    subscriptionEndsAt:
      input.status === "active" && input.subscriptionEndsAt ? romeEndOfDay(input.subscriptionEndsAt).toISOString() : null,
    graceDays: input.graceDays,
    suspendedReason: null,
    showPoweredBy: input.showPoweredBy,
    lastActivityAt: null,
    createdAt: now,
    updatedAt: now,
    modules,
    branding: { ...DEFAULT_BRANDING, ...input.branding },
    settings: DEFAULT_SETTINGS,
    stats: { ordersThisMonth: 0, ordersMonth: currentMonth() },
  };

  try {
    await db().runTransaction(async (tx) => {
      const slugRef = refs.slugs().doc(input.slug);
      if ((await tx.get(slugRef)).exists) throw new Error("SLUG_TAKEN");
      tx.create(slugRef, { tenantId: tenantRef.id });
      tx.create(tenantRef, tenant);
      tx.create(refs.accessTokens().doc(access.hash), {
        tenantId: tenantRef.id,
        tokenEnc: access.enc,
        hint: access.hint,
        rotatedAt: now,
      });
      tx.create(ownerRef, {
        displayName: input.ownerName,
        role: "owner",
        active: true,
        color: "#0f172a",
        sort: 0,
        lastLoginAt: null,
        createdAt: now,
      });
      tx.create(refs.staffCredentials().doc(ownerRef.id), { tenantId: tenantRef.id, pinHash, pinUpdatedAt: now });
      // Default production departments.
      ["Cucina", "Bar"].forEach((name, sort) => tx.create(refs.departments(tenantRef.id).doc(), { name, sort, printerId: null }));
      tx.create(refs.subscriptionEvents(tenantRef.id).doc(), {
        type: "created",
        periodEnd: tenant.subscriptionEndsAt ?? tenant.trialEndsAt,
        amountCents: null,
        note: "Cliente creato",
        createdBy: admin.userId,
        createdAt: now,
      });
    });
  } catch (e) {
    if ((e as Error).message === "SLUG_TAKEN") return fail("Indirizzo (slug) già in uso.");
    console.error(e);
    return fail("Errore durante la creazione del cliente.");
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      const path = await storeTenantImage(tenantRef.id, "branding", logo, { maxWidth: 512, maxHeight: 512 });
      await tenantRef.update({ "branding.logoPath": path });
    } catch (e) {
      console.error("logo upload failed", e);
    }
  }

  await logPlatformAction(admin.userId, "tenant.created", tenantRef.id, { slug: input.slug });
  revalidatePath("/superadmin");
  return ok({ tenantId: tenantRef.id, link: managementLink(access.token), pin, slug: input.slug });
}

// ---------------------------------------------------------------------------
// Tenant maintenance
// ---------------------------------------------------------------------------

const updateTenantSchema = tenantDetailsSchema.extend({
  planId: z.string().min(1).nullable(),
  graceDays: z.coerce.number().int().min(0).max(90),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  geofenceRadiusM: z.coerce.number().int().min(10).max(2000),
  defaultMenuMode: z.enum(["static", "table_orders", "ayce"]),
  showPoweredBy: z.boolean(),
});

export async function updateTenant(tenantId: string, values: unknown): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const parsed = updateTenantSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const ref = refs.tenant(tenantId);
  const before = (await ref.get()).data();
  if (!before) return fail("Cliente non trovato.");
  await ref.update({ ...parsed.data, updatedAt: nowIso() });
  if (before.planId !== parsed.data.planId) {
    await refs.subscriptionEvents(tenantId).add({
      type: "plan_changed", periodEnd: null, amountCents: null, note: "Piano modificato",
      createdBy: admin.userId, createdAt: nowIso(),
    });
  }
  await logPlatformAction(admin.userId, "tenant.updated", tenantId, { fields: Object.keys(parsed.data) });
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

export async function updateBranding(tenantId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
  const parsed = z
    .object({ primaryColor: hex, accentColor: hex, backgroundColor: hex, fontFamily: z.enum(FONT_OPTIONS) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Colori o font non validi.");
  const ref = refs.tenant(tenantId);
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [`branding.${k}`, v]));
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      const current = (await ref.get()).get("branding.logoPath");
      update["branding.logoPath"] = await storeTenantImage(tenantId, "branding", logo, { maxWidth: 512, maxHeight: 512 });
      await removeTenantImage(current);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
  await ref.update({ ...update, updatedAt: nowIso() });
  await logPlatformAction(admin.userId, "tenant.branding_updated", tenantId);
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

export async function setModule(tenantId: string, module: string, enabled: boolean): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  if (!(MODULE_KEYS as readonly string[]).includes(module)) return fail("Modulo sconosciuto.");
  await refs.tenant(tenantId).update({ [`modules.${module}`]: enabled, updatedAt: nowIso() });
  const action = enabled ? "module.enabled" : "module.disabled";
  await logPlatformAction(admin.userId, action, tenantId, { module });
  await logTenantAction(tenantId, ASSISTANCE(admin.userId), action, { entity: "module", entityId: module });
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

export async function rotateAccessToken(tenantId: string): Promise<ActionResult<{ link: string }>> {
  const admin = await requirePlatformAdmin();
  const access = newAccessToken();
  const old = await accessTokenDoc(tenantId);
  const batch = db().batch();
  if (old) batch.delete(old.ref);
  batch.create(refs.accessTokens().doc(access.hash), { tenantId, tokenEnc: access.enc, hint: access.hint, rotatedAt: nowIso() });
  await batch.commit();
  await revokeTenantSessions(tenantId);
  await logPlatformAction(admin.userId, "tenant.token_rotated", tenantId);
  await logTenantAction(tenantId, ASSISTANCE(admin.userId), "access_link.rotated");
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok({ link: managementLink(access.token) });
}

export async function revealAccessLink(tenantId: string): Promise<ActionResult<{ link: string }>> {
  const admin = await requirePlatformAdmin();
  const doc = await accessTokenDoc(tenantId);
  if (!doc) return fail("Cliente non trovato.");
  await logPlatformAction(admin.userId, "tenant.link_revealed", tenantId);
  return ok({ link: managementLink(decrypt(doc.get("tokenEnc"))) });
}

async function ownerOf(tenantId: string) {
  const snap = await refs.staff(tenantId).where("role", "==", "owner").limit(1).get();
  return snap.docs[0] ?? null;
}

export async function resetOwnerPin(tenantId: string): Promise<ActionResult<{ pin: string }>> {
  const admin = await requirePlatformAdmin();
  const owner = await ownerOf(tenantId);
  if (!owner) return fail("Titolare non trovato.");
  const pin = generatePin(6);
  await refs.staffCredentials().doc(owner.id).set({ tenantId, pinHash: await hashPin(pin), pinUpdatedAt: nowIso() });
  await revokeTenantSessions(tenantId, owner.id);
  await logPlatformAction(admin.userId, "tenant.owner_pin_reset", tenantId);
  await logTenantAction(tenantId, ASSISTANCE(admin.userId), "owner_pin.reset");
  return ok({ pin });
}

// ---------------------------------------------------------------------------
// Subscription lifecycle
// ---------------------------------------------------------------------------

const renewSchema = z.object({
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  amountCents: z.coerce.number().int().min(0).nullable(),
  note: z.string().max(200).optional(),
});

export async function renewSubscription(tenantId: string, values: unknown): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const parsed = renewSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const periodEnd = romeEndOfDay(parsed.data.periodEnd).toISOString();
  await refs.tenant(tenantId).update({ status: "active", subscriptionEndsAt: periodEnd, suspendedReason: null, updatedAt: nowIso() });
  await refs.subscriptionEvents(tenantId).add({
    type: "renewed", periodEnd, amountCents: parsed.data.amountCents, note: parsed.data.note || null,
    createdBy: admin.userId, createdAt: nowIso(),
  });
  await logPlatformAction(admin.userId, "tenant.renewed", tenantId, { periodEnd });
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

export async function suspendTenant(tenantId: string, reason: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const note = reason.trim().slice(0, 200);
  await refs.tenant(tenantId).update({ status: "suspended", suspendedReason: note || "Sospeso dall'amministratore", updatedAt: nowIso() });
  await refs.subscriptionEvents(tenantId).add({
    type: "suspended", periodEnd: null, amountCents: null, note: note || null, createdBy: admin.userId, createdAt: nowIso(),
  });
  await revokeTenantSessions(tenantId);
  await logPlatformAction(admin.userId, "tenant.suspended", tenantId, { reason: note });
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

export async function reactivateTenant(tenantId: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  await refs.tenant(tenantId).update({ status: "active", suspendedReason: null, updatedAt: nowIso() });
  await refs.subscriptionEvents(tenantId).add({
    type: "reactivated", periodEnd: null, amountCents: null, note: null, createdBy: admin.userId, createdAt: nowIso(),
  });
  await logPlatformAction(admin.userId, "tenant.reactivated", tenantId);
  revalidatePath(`/superadmin/clienti/${tenantId}`);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Impersonation ("accedi come cliente")
// ---------------------------------------------------------------------------

export async function impersonateTenant(tenantId: string, reason: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  if (reason.trim().length < 3) return fail("Indica il motivo dell'accesso.");
  const [tokenDoc, owner] = await Promise.all([accessTokenDoc(tenantId), ownerOf(tenantId)]);
  if (!tokenDoc || !owner) return fail("Cliente non trovato.");
  const token = decrypt(tokenDoc.get("tokenEnc"));

  await refs.impersonations().add({ adminId: admin.userId, tenantId, reason: reason.trim(), startedAt: nowIso(), endedAt: null });
  await startStaffSession({ token, tenantId, staffId: owner.id, kind: "impersonation", impersonatedBy: admin.userId });
  await logPlatformAction(admin.userId, "tenant.impersonated", tenantId, { reason: reason.trim() });
  await logTenantAction(tenantId, ASSISTANCE(admin.userId), "impersonation.started", { diff: { reason: reason.trim() } });
  redirect(`/g/${token}/dashboard`);
}

// ---------------------------------------------------------------------------
// Plans & platform settings
// ---------------------------------------------------------------------------

const planSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().regex(/^[a-z0-9_-]{2,30}$/, "Codice: lettere minuscole, numeri, - e _"),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
  priceMonthCents: z.coerce.number().int().min(0),
  maxTables: z.coerce.number().int().min(0).nullable(),
  maxProducts: z.coerce.number().int().min(0).nullable(),
  maxStaff: z.coerce.number().int().min(0).nullable(),
  includedModules: z.array(z.enum(MODULE_KEYS)),
  active: z.boolean(),
  sort: z.coerce.number().int().default(0),
});

export async function savePlan(values: unknown): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const parsed = planSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const { id, ...rest } = parsed.data;
  const dup = await refs.plans().where("code", "==", rest.code).get();
  if (dup.docs.some((d) => d.id !== id)) return fail("Codice piano già esistente.");
  if (id) await refs.plans().doc(id).set(rest, { merge: true });
  else await refs.plans().add(rest);
  await logPlatformAction(admin.userId, id ? "plan.updated" : "plan.created", null, { code: rest.code });
  revalidatePath("/superadmin/piani");
  return ok(undefined);
}

const settingsSchema = z.object({
  brandName: z.string().trim().min(2).max(40),
  brandUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\//.test(v), "URL non valido")
    .transform((v) => v || null),
  defaultGraceDays: z.coerce.number().int().min(0).max(90),
  expiryWarningDays: z
    .string()
    .transform((s) => s.split(/[,\s]+/).filter(Boolean).map(Number))
    .refine((a) => a.every((n) => Number.isInteger(n) && n > 0 && n < 120), "Giorni non validi"),
});

export async function savePlatformSettings(values: unknown): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dati non validi.");
  await refs.platformSettings().set(parsed.data, { merge: true });
  await logPlatformAction(admin.userId, "platform.settings_updated", null);
  revalidatePath("/superadmin/impostazioni");
  return ok(undefined);
}

export async function signOutAdmin() {
  await closeAdminSession();
  redirect("/superadmin/login");
}
