import { z } from "zod";
import { MODULE_KEYS } from "./modules";
import { SLUG_REGEX, RESERVED_SLUGS } from "./slug";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido");
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const FONT_OPTIONS = ["Inter", "Poppins", "Montserrat", "Lora", "Playfair Display", "Roboto Slab", "Nunito", "Oswald"] as const;

/** Italian VAT number (11 digits with checksum). Empty is allowed. */
export function isValidPartitaIva(v: string): boolean {
  if (!/^\d{11}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(v[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return (10 - (sum % 10)) % 10 === Number(v[10]);
}

export const tenantDetailsSchema = z.object({
  legalName: z.string().trim().min(2, "Inserisci la ragione sociale").max(120),
  displayName: z.string().trim().min(2, "Inserisci il nome del locale").max(80),
  vatNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/^IT/i, "").replace(/\s/g, ""))
    .refine((v) => v === "" || isValidPartitaIva(v), "Partita IVA non valida")
    .transform((v) => v || null),
  address: optionalText(),
  city: optionalText(80),
  postalCode: optionalText(10),
  province: optionalText(4),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email non valida")
    .transform((v) => v || null),
  contactName: optionalText(80),
});

export const createTenantSchema = tenantDetailsSchema.extend({
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, "Indirizzo non valido")
    .refine((s) => !RESERVED_SLUGS.has(s), "Indirizzo riservato"),
  ownerName: z.string().trim().min(1).max(60).default("Titolare"),
  planId: z.string().min(1).max(64).nullable(),
  status: z.enum(["trial", "active"]),
  trialDays: z.coerce.number().int().min(0).max(365).default(14),
  subscriptionEndsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data di scadenza non valida")
    .nullable()
    .optional(),
  graceDays: z.coerce.number().int().min(0).max(90).default(7),
  modules: z.array(z.enum(MODULE_KEYS)),
  defaultMenuMode: z.enum(["static", "table_orders", "ayce"]),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  geofenceRadiusM: z.coerce.number().int().min(10).max(2000).default(100),
  showPoweredBy: z.boolean().default(true),
  branding: z.object({
    primaryColor: hex,
    accentColor: hex,
    backgroundColor: hex,
    fontFamily: z.enum(FONT_OPTIONS),
  }),
});
export type CreateTenantInput = z.input<typeof createTenantSchema>;
