import { z } from "zod";
import { ALLERGEN_IDS, PRODUCT_TAG_KEYS, VAT_RATES_BP } from "./menu";

const i18n = (max: number, required = false) =>
  z
    .record(z.string().regex(/^[a-z]{2}$/), z.string().trim().max(max))
    .refine((v) => !required || !!v.it?.trim(), "Il testo in italiano è obbligatorio");

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

export const visibilitySchema = z
  .object({ weekdays: z.array(z.number().int().min(1).max(7)), from: time, to: time })
  .nullable();

export const categorySchema = z.object({
  id: z.string().optional(),
  name: i18n(80, true),
  description: i18n(300),
  parentId: z.string().nullable(),
  icon: z.string().max(8).nullable(),
  active: z.boolean(),
  visibility: visibilitySchema,
  menuIds: z.array(z.string()),
});

export const productSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1, "Scegli una categoria"),
  name: i18n(100, true),
  description: i18n(600),
  priceCents: z.number().int().min(0).max(1_000_000),
  prices: z.record(z.string(), z.number().int().min(0).max(1_000_000)),
  vatRateBp: z.number().int().refine((v) => (VAT_RATES_BP as readonly number[]).includes(v), "Aliquota IVA non valida"),
  departmentId: z.string().nullable(),
  allergens: z.array(z.number().int().refine((v) => (ALLERGEN_IDS as number[]).includes(v))),
  tags: z.array(z.enum(PRODUCT_TAG_KEYS as [string, ...string[]])),
  isFrozen: z.boolean(),
  available: z.boolean(),
  hidden: z.boolean(),
  images: z.array(z.string()).max(6),
  modifierGroupIds: z.array(z.string()),
  ayceIncluded: z.boolean(),
  ayceMaxQty: z.number().int().min(1).max(99).nullable(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const modifierGroupSchema = z
  .object({
    id: z.string().optional(),
    name: i18n(60, true),
    kind: z.enum(["variant", "addon", "removal"]),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          name: i18n(60, true),
          priceDeltaCents: z.number().int().min(-100_000).max(100_000),
          available: z.boolean(),
        }),
      )
      .min(1, "Aggiungi almeno un'opzione")
      .max(40),
  })
  .refine((g) => g.minSelect <= g.maxSelect, "Il minimo non può superare il massimo")
  .refine((g) => g.minSelect <= g.options.length, "Il minimo supera il numero di opzioni");

export const menuSchema = z.object({
  id: z.string().optional(),
  name: i18n(60, true),
  kind: z.enum(["dine_in", "ayce", "takeaway"]),
  active: z.boolean(),
  schedule: visibilitySchema,
});
