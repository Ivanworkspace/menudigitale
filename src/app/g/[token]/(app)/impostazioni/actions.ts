"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { menuChanged } from "@/server/menu/repo";
import { storeTenantImage, removeTenantImage } from "@/server/images";
import { FONT_OPTIONS } from "@/domain/tenant-input";
import { LANGUAGES } from "@/domain/menu";
import type { StaffContext } from "@/server/auth/staff-session";

const PERM = { permission: "settings.manage" as const };
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\//.test(v), "Inserisci un indirizzo che inizi con https://")
  .transform((v) => v || null);

function parse<T extends z.ZodTypeAny>(schema: T, values: unknown): z.infer<T> {
  const r = schema.safeParse(values);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
  return r.data;
}

async function saved(ctx: StaffContext, action: string, fields: string[]) {
  await logTenantAction(ctx.tenant.id, staffActor(ctx), action, { diff: { fields } });
  await menuChanged(ctx.tenant.id);
  revalidatePath(`${ctx.basePath}`, "layout");
}

const venueSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).transform((v) => v || null),
  email: z.string().trim().max(160).transform((v) => v || null),
  address: z.string().trim().max(200).transform((v) => v || null),
  city: z.string().trim().max(80).transform((v) => v || null),
  postalCode: z.string().trim().max(10).transform((v) => v || null),
  province: z.string().trim().max(4).transform((v) => v || null),
  openingHours: z.array(z.object({ weekdays: z.array(z.number().int().min(1).max(7)).min(1), open: time, close: time })).max(20),
  closures: z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(100).optional() })).max(50),
  reviewUrl: optionalUrl,
  socials: z.object({ instagram: optionalUrl, facebook: optionalUrl, tiktok: optionalUrl, website: optionalUrl }),
});

export async function saveVenue(token: string, values: unknown) {
  return staffAction(token, PERM, async (ctx) => {
    const v = parse(venueSchema, values);
    const socials = Object.fromEntries(Object.entries(v.socials).filter(([, url]) => url)) as Record<string, string>;
    await refs.tenant(ctx.tenant.id).update({
      displayName: v.displayName,
      phone: v.phone,
      email: v.email,
      address: v.address,
      city: v.city,
      postalCode: v.postalCode,
      province: v.province,
      "settings.openingHours": v.openingHours,
      "settings.closures": v.closures,
      "settings.reviewUrl": v.reviewUrl,
      "settings.socials": socials,
      updatedAt: nowIso(),
    });
    await saved(ctx, "settings.venue_updated", Object.keys(v));
  });
}

const menuSettingsSchema = z.object({
  languages: z.array(z.string().refine((l) => l in LANGUAGES)).min(1),
  soldOutBehavior: z.enum(["show", "hide"]),
  frozenNote: z.record(z.string(), z.string().max(200)),
  defaultMenuMode: z.enum(["static", "table_orders", "ayce"]),
  modeSchedules: z
    .array(z.object({ weekdays: z.array(z.number().int().min(1).max(7)), from: time, to: time, mode: z.enum(["static", "table_orders", "ayce"]) }))
    .max(20),
});

export async function saveMenuSettings(token: string, values: unknown) {
  return staffAction(token, PERM, async (ctx) => {
    const v = parse(menuSettingsSchema, values);
    if (!ctx.modules.multilang && v.languages.some((l) => l !== "it")) throw new UserError("Il modulo Multilingua non è attivo.");
    if (!ctx.modules.orders && (v.defaultMenuMode !== "static" || v.modeSchedules.some((s) => s.mode !== "static"))) {
      throw new UserError("Il modulo Ordini non è attivo: è disponibile solo il menu statico.");
    }
    const languages = ["it", ...v.languages.filter((l) => l !== "it")];
    await refs.tenant(ctx.tenant.id).update({
      "settings.languages": languages,
      "settings.soldOutBehavior": v.soldOutBehavior,
      "settings.frozenNote": v.frozenNote,
      "settings.modeSchedules": v.modeSchedules,
      defaultMenuMode: v.defaultMenuMode,
      updatedAt: nowIso(),
    });
    await saved(ctx, "settings.menu_updated", Object.keys(v));
  });
}

const chargesSchema = z.object({
  coverChargeCents: z.number().int().min(0).max(10_000),
  servicePctBp: z.number().int().min(0).max(3000),
});

export async function saveCharges(token: string, values: unknown) {
  return staffAction(token, PERM, async (ctx) => {
    const v = parse(chargesSchema, values);
    await refs.tenant(ctx.tenant.id).update({
      "settings.coverChargeCents": v.coverChargeCents,
      "settings.servicePctBp": v.servicePctBp,
      updatedAt: nowIso(),
    });
    await saved(ctx, "settings.charges_updated", Object.keys(v));
  });
}

export async function saveAppearance(token: string, formData: FormData) {
  return staffAction(token, PERM, async (ctx) => {
    const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
    const v = parse(
      z.object({ primaryColor: hex, accentColor: hex, backgroundColor: hex, fontFamily: z.enum(FONT_OPTIONS) }),
      Object.fromEntries(["primaryColor", "accentColor", "backgroundColor", "fontFamily"].map((k) => [k, formData.get(k)])),
    );
    const update: Record<string, unknown> = Object.fromEntries(Object.entries(v).map(([k, val]) => [`branding.${k}`, val]));
    for (const [field, opts] of [
      ["logo", { maxWidth: 512, maxHeight: 512 }],
      ["cover", { maxWidth: 1800, maxHeight: 1000 }],
    ] as const) {
      const file = formData.get(field);
      const pathKey = field === "logo" ? "logoPath" : "coverPath";
      if (formData.get(`remove_${field}`) === "1") {
        await removeTenantImage(ctx.tenant.branding[pathKey]);
        update[`branding.${pathKey}`] = null;
      } else if (file instanceof File && file.size > 0) {
        try {
          update[`branding.${pathKey}`] = await storeTenantImage(ctx.tenant.id, "branding", file, opts);
        } catch (e) {
          throw new UserError((e as Error).message);
        }
        await removeTenantImage(ctx.tenant.branding[pathKey]);
      }
    }
    await refs.tenant(ctx.tenant.id).update({ ...update, updatedAt: nowIso() });
    await saved(ctx, "settings.appearance_updated", Object.keys(v));
  });
}

export async function saveLegal(token: string, values: unknown) {
  return staffAction(token, PERM, async (ctx) => {
    const v = parse(
      z.object({ privacyText: z.string().max(20_000), cookieText: z.string().max(20_000) }),
      values,
    );
    await refs.tenant(ctx.tenant.id).update({
      "settings.privacyText": v.privacyText.trim() || null,
      "settings.cookieText": v.cookieText.trim() || null,
      updatedAt: nowIso(),
    });
    await saved(ctx, "settings.legal_updated", Object.keys(v));
  });
}

const protectionSchema = z.object({
  requireOpenTable: z.boolean(),
  autoOpenOnScan: z.boolean(),
  geofence: z.enum(["off", "block", "waiter_confirm"]),
  tableCode: z.boolean(),
  manualFirstApproval: z.boolean(),
  maxOrdersPerMinute: z.number().int().min(1).max(20),
});

export async function saveOrderProtection(token: string, values: unknown) {
  return staffAction(token, { ...PERM, module: "orders" }, async (ctx) => {
    const v = parse(protectionSchema, values);
    await refs.tenant(ctx.tenant.id).update({ "settings.orderProtection": v, updatedAt: nowIso() });
    await saved(ctx, "settings.order_protection_updated", Object.keys(v));
  });
}

const price = z.number().int().min(0).max(100_000);
const ayceSchema = z.object({
  prices: z.object({
    lunch: z.object({ adultCents: price, childCents: price }),
    dinner: z.object({ adultCents: price, childCents: price }),
    holiday: z.object({ adultCents: price, childCents: price }),
  }),
  lunchUntil: time,
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  weekendAsHoliday: z.boolean(),
  piecesPerPersonPerRound: z.number().int().min(1).max(50),
  minRoundIntervalSec: z.number().int().min(0).max(3600),
  maxStayMin: z.number().int().min(15).max(600).nullable(),
  leftoverPenaltyNote: z.string().max(300).nullable(),
});

export async function saveAyceSettings(token: string, values: unknown) {
  return staffAction(token, { ...PERM, module: "orders" }, async (ctx) => {
    const v = parse(ayceSchema, values);
    await refs.tenant(ctx.tenant.id).update({ "settings.ayce": v, updatedAt: nowIso() });
    await saved(ctx, "settings.ayce_updated", Object.keys(v));
  });
}

// --- Printers -------------------------------------------------------------------

const printerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(40),
  transport: z.enum(["network", "printnode"]),
  host: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^[a-zA-Z0-9.-]+$/.test(v), "Indirizzo IP o nome host non valido")
    .transform((v) => v || null),
  port: z.number().int().min(1).max(65535),
  printNodeId: z.number().int().positive().nullable(),
  departmentIds: z.array(z.string()),
  width: z.union([z.literal(32), z.literal(42), z.literal(48)]),
  active: z.boolean(),
});

export async function savePrinter(token: string, values: unknown) {
  return staffAction(token, PERM, async (ctx) => {
    const { id, ...v } = parse(printerSchema, values);
    if (v.transport === "network" && !v.host) throw new UserError("Inserisci l'indirizzo IP della stampante.");
    if (v.transport === "printnode" && !v.printNodeId) throw new UserError("Inserisci l'ID stampante di PrintNode.");
    const col = refs.printers(ctx.tenant.id);
    if (id) await col.doc(id).set(v, { merge: true });
    else await col.add(v);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "printer.updated" : "printer.created", { diff: { name: v.name } });
    revalidatePath(`${ctx.basePath}/impostazioni/stampanti`);
  });
}

export async function deletePrinter(token: string, printerId: string) {
  return staffAction(token, PERM, async (ctx) => {
    await refs.printers(ctx.tenant.id).doc(printerId).delete();
    revalidatePath(`${ctx.basePath}/impostazioni/stampanti`);
  });
}

export async function testPrinter(token: string, printerId: string) {
  return staffAction(token, PERM, async (ctx) => {
    const { printOrderItems, getPrinter } = await import("@/server/printing");
    const p = await getPrinter(ctx.tenant.id, printerId);
    if (!p) throw new UserError("Stampante non trovata.");
    const dep = p.departmentIds[0];
    if (!dep) throw new UserError("Assegna almeno un reparto alla stampante.");
    await printOrderItems(
      ctx.tenant,
      { id: "test", tableLabel: "TEST", createdByName: ctx.staff.displayName, urgent: false, round: null, notes: "Stampa di prova" },
      [{ id: "t", productId: "t", name: { it: "Prova di stampa" }, qty: 1, unitPriceCents: 0, vatRateBp: 0, modifiers: [], notes: "Se leggi questo, funziona!", course: 1, departmentId: dep, ayceIncluded: false, status: "new", statusAt: nowIso() }],
    );
  });
}

/** New key for the local print server (shown once; only the hash is stored). */
export async function generatePrintKey(token: string) {
  return staffAction(token, PERM, async (ctx) => {
    const { randomToken, sha256 } = await import("@/server/crypto");
    const key = randomToken(32);
    const old = await refs.printKeys().where("tenantId", "==", ctx.tenant.id).get();
    const batch = refs.printKeys().firestore.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    batch.set(refs.printKeys().doc(sha256(key)), { tenantId: ctx.tenant.id, createdAt: nowIso() });
    await batch.commit();
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "printing.key_generated");
    return { key };
  });
}

export async function savePrintNodeKey(token: string, apiKey: string) {
  return staffAction(token, PERM, async (ctx) => {
    const { encrypt } = await import("@/server/crypto");
    const k = apiKey.trim();
    await refs.tenant(ctx.tenant.id).update({ "printing.printNodeKeyEnc": k ? encrypt(k) : null });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "printing.printnode_key_updated");
  });
}

// --- Payments ---------------------------------------------------------------------

export async function savePaymentMethods(token: string, methods: string[]) {
  return staffAction(token, { ...PERM, module: "billing" }, async (ctx) => {
    const allowed = ["cash", "card", "satispay", "paypal", "voucher", "other"];
    const list = methods.filter((m) => allowed.includes(m));
    if (!list.length) throw new UserError("Scegli almeno un metodo di pagamento.");
    await refs.tenant(ctx.tenant.id).update({ "settings.paymentMethods": list, updatedAt: nowIso() });
    await saved(ctx, "settings.payment_methods_updated", list);
  });
}

