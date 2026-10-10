/**
 * Menu domain: allergens (EU Reg. 1169/2011), tags, translations, time-based
 * visibility and server-side price resolution. Pure logic, no I/O.
 */

// ---------------------------------------------------------------------------
// I18n
// ---------------------------------------------------------------------------

export type I18n = Record<string, string>;

export const LANGUAGES: Record<string, { label: string; flag: string }> = {
  it: { label: "Italiano", flag: "🇮🇹" },
  en: { label: "English", flag: "🇬🇧" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  fr: { label: "Français", flag: "🇫🇷" },
  es: { label: "Español", flag: "🇪🇸" },
  zh: { label: "中文", flag: "🇨🇳" },
  ja: { label: "日本語", flag: "🇯🇵" },
  ru: { label: "Русский", flag: "🇷🇺" },
  ar: { label: "العربية", flag: "🇸🇦" },
  pt: { label: "Português", flag: "🇵🇹" },
  nl: { label: "Nederlands", flag: "🇳🇱" },
  pl: { label: "Polski", flag: "🇵🇱" },
};

/** Text in `lang`, falling back to Italian, then to any available value. */
export function tr(text: I18n | null | undefined, lang: string, fallback = "it"): string {
  if (!text) return "";
  return text[lang]?.trim() || text[fallback]?.trim() || Object.values(text).find((v) => v?.trim()) || "";
}

// ---------------------------------------------------------------------------
// Allergens & tags
// ---------------------------------------------------------------------------

export type AllergenId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export const ALLERGENS: { id: AllergenId; icon: string; name: I18n }[] = [
  { id: 1, icon: "🌾", name: { it: "Cereali contenenti glutine", en: "Cereals containing gluten", de: "Glutenhaltiges Getreide", fr: "Céréales contenant du gluten", es: "Cereales con gluten" } },
  { id: 2, icon: "🦐", name: { it: "Crostacei", en: "Crustaceans", de: "Krebstiere", fr: "Crustacés", es: "Crustáceos" } },
  { id: 3, icon: "🥚", name: { it: "Uova", en: "Eggs", de: "Eier", fr: "Œufs", es: "Huevos" } },
  { id: 4, icon: "🐟", name: { it: "Pesce", en: "Fish", de: "Fisch", fr: "Poisson", es: "Pescado" } },
  { id: 5, icon: "🥜", name: { it: "Arachidi", en: "Peanuts", de: "Erdnüsse", fr: "Arachides", es: "Cacahuetes" } },
  { id: 6, icon: "🫘", name: { it: "Soia", en: "Soybeans", de: "Soja", fr: "Soja", es: "Soja" } },
  { id: 7, icon: "🥛", name: { it: "Latte e derivati", en: "Milk", de: "Milch", fr: "Lait", es: "Leche" } },
  { id: 8, icon: "🌰", name: { it: "Frutta a guscio", en: "Nuts", de: "Schalenfrüchte", fr: "Fruits à coque", es: "Frutos de cáscara" } },
  { id: 9, icon: "🥬", name: { it: "Sedano", en: "Celery", de: "Sellerie", fr: "Céleri", es: "Apio" } },
  { id: 10, icon: "🟡", name: { it: "Senape", en: "Mustard", de: "Senf", fr: "Moutarde", es: "Mostaza" } },
  { id: 11, icon: "⚪", name: { it: "Semi di sesamo", en: "Sesame seeds", de: "Sesamsamen", fr: "Graines de sésame", es: "Sésamo" } },
  { id: 12, icon: "🍷", name: { it: "Anidride solforosa e solfiti", en: "Sulphites", de: "Schwefeldioxid und Sulfite", fr: "Anhydride sulfureux et sulfites", es: "Sulfitos" } },
  { id: 13, icon: "🌼", name: { it: "Lupini", en: "Lupin", de: "Lupinen", fr: "Lupin", es: "Altramuces" } },
  { id: 14, icon: "🦪", name: { it: "Molluschi", en: "Molluscs", de: "Weichtiere", fr: "Mollusques", es: "Moluscos" } },
];

export const ALLERGEN_IDS = ALLERGENS.map((a) => a.id);

export const PRODUCT_TAGS = {
  vegetarian: { icon: "🌱", label: { it: "Vegetariano", en: "Vegetarian", de: "Vegetarisch", fr: "Végétarien", es: "Vegetariano" } },
  vegan: { icon: "🌿", label: { it: "Vegano", en: "Vegan", de: "Vegan", fr: "Végan", es: "Vegano" } },
  spicy: { icon: "🌶️", label: { it: "Piccante", en: "Spicy", de: "Scharf", fr: "Épicé", es: "Picante" } },
  gluten_free: { icon: "🚫🌾", label: { it: "Senza glutine", en: "Gluten free", de: "Glutenfrei", fr: "Sans gluten", es: "Sin gluten" } },
  new: { icon: "✨", label: { it: "Novità", en: "New", de: "Neu", fr: "Nouveau", es: "Novedad" } },
  recommended: { icon: "⭐", label: { it: "Consigliato", en: "Recommended", de: "Empfohlen", fr: "Recommandé", es: "Recomendado" } },
  special: { icon: "🍽️", label: { it: "Piatto del giorno", en: "Today's special", de: "Tagesgericht", fr: "Plat du jour", es: "Plato del día" } },
} as const;
export type ProductTag = keyof typeof PRODUCT_TAGS;
export const PRODUCT_TAG_KEYS = Object.keys(PRODUCT_TAGS) as ProductTag[];

export const VAT_RATES_BP = [400, 500, 1000, 2200] as const;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type Visibility = { weekdays: number[]; from: string | null; to: string | null };

export type Menu = {
  id: string;
  name: I18n;
  kind: "dine_in" | "ayce" | "takeaway";
  active: boolean;
  sort: number;
  /** When this menu is the default one (e.g. lunch 11:30–15:00). */
  schedule: Visibility | null;
};

export type Category = {
  id: string;
  name: I18n;
  description: I18n;
  parentId: string | null;
  icon: string | null;
  imagePath: string | null;
  sort: number;
  active: boolean;
  visibility: Visibility | null;
  /** Menus this category belongs to; empty = all menus. */
  menuIds: string[];
};

export type ModifierOption = { id: string; name: I18n; priceDeltaCents: number; available: boolean };

export type ModifierGroup = {
  id: string;
  name: I18n;
  kind: "variant" | "addon" | "removal";
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
  sort: number;
};

export type Product = {
  id: string;
  categoryId: string;
  name: I18n;
  description: I18n;
  priceCents: number;
  /** Per-menu price overrides (price lists). */
  prices: Record<string, number>;
  vatRateBp: number;
  departmentId: string | null;
  allergens: number[];
  tags: ProductTag[];
  isFrozen: boolean;
  available: boolean;
  hidden: boolean;
  images: string[];
  sort: number;
  modifierGroupIds: string[];
  ayceIncluded: boolean;
  ayceMaxQty: number | null;
  /** Bill of materials for inventory (module "inventory"). */
  recipe?: { ingredientId: string; qty: number }[];
  createdAt: string;
  updatedAt: string;
};

export type Department = { id: string; name: string; sort: number; printerId: string | null };

// ---------------------------------------------------------------------------
// Time-based visibility (evaluated in the tenant's timezone)
// ---------------------------------------------------------------------------

/** ISO weekday (1 = Monday) and "HH:MM" in a timezone. */
export function localClock(now: Date, timeZone = "Europe/Rome"): { weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { weekday, time: `${hour}:${get("minute")}` };
}

/** Supports windows across midnight (e.g. 22:00–02:00). */
export function isVisibleAt(v: Visibility | null | undefined, clock: { weekday: number; time: string }): boolean {
  if (!v) return true;
  const { from, to } = v;
  const inTime = !from || !to ? true : from <= to ? clock.time >= from && clock.time < to : clock.time >= from || clock.time < to;
  if (!inTime) return false;
  if (!v.weekdays?.length) return true;
  // For overnight windows after midnight, the window belongs to the previous day.
  const overnightTail = from && to && from > to && clock.time < to;
  const day = overnightTail ? ((clock.weekday + 5) % 7) + 1 : clock.weekday;
  return v.weekdays.includes(day);
}

/** Menu to show by default now: first active scheduled match, else first active. */
export function currentMenu(menus: Menu[], clock: { weekday: number; time: string }): Menu | null {
  const active = menus.filter((m) => m.active).sort((a, b) => a.sort - b.sort);
  return active.find((m) => m.schedule && isVisibleAt(m.schedule, clock)) ?? active[0] ?? null;
}

export function categoryInMenu(c: Category, menuId: string | null): boolean {
  return !menuId || c.menuIds.length === 0 || c.menuIds.includes(menuId);
}

// ---------------------------------------------------------------------------
// Pricing (authoritative, server-side)
// ---------------------------------------------------------------------------

export function productPrice(p: Pick<Product, "priceCents" | "prices">, menuId: string | null): number {
  return (menuId && p.prices?.[menuId] != null ? p.prices[menuId] : p.priceCents) ?? 0;
}

export type ModifierSelection = { groupId: string; optionIds: string[] };

export type PricedLine = {
  unitPriceCents: number;
  modifiers: { groupId: string; groupName: I18n; optionId: string; name: I18n; priceDeltaCents: number }[];
};

export class SelectionError extends Error {}

/**
 * Validates a customer's selection against the product's modifier groups and
 * returns the authoritative unit price. Never trust prices from the browser.
 */
export function priceLine(
  product: Pick<Product, "priceCents" | "prices" | "modifierGroupIds">,
  groups: ModifierGroup[],
  selection: ModifierSelection[],
  menuId: string | null,
): PricedLine {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const allowed = new Set(product.modifierGroupIds);
  for (const s of selection) {
    if (!allowed.has(s.groupId)) throw new SelectionError("Opzione non valida per questo prodotto.");
  }
  let unit = productPrice(product, menuId);
  const modifiers: PricedLine["modifiers"] = [];
  for (const gid of product.modifierGroupIds) {
    const g = byId.get(gid);
    if (!g) continue;
    const chosen = [...new Set(selection.find((s) => s.groupId === gid)?.optionIds ?? [])];
    if (chosen.length < g.minSelect) throw new SelectionError(`Scegli almeno ${g.minSelect} in "${tr(g.name, "it")}".`);
    if (chosen.length > g.maxSelect) throw new SelectionError(`Puoi scegliere al massimo ${g.maxSelect} in "${tr(g.name, "it")}".`);
    for (const oid of chosen) {
      const o = g.options.find((x) => x.id === oid);
      if (!o || !o.available) throw new SelectionError("Opzione non disponibile.");
      unit += o.priceDeltaCents;
      modifiers.push({ groupId: g.id, groupName: g.name, optionId: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents });
    }
  }
  if (unit < 0) unit = 0;
  return { unitPriceCents: unit, modifiers };
}

/** Excludes products containing any of the given allergens. */
export function filterByAllergens<T extends { allergens: number[] }>(items: T[], excluded: number[]): T[] {
  if (!excluded.length) return items;
  const ex = new Set(excluded);
  return items.filter((p) => !p.allergens.some((a) => ex.has(a)));
}
