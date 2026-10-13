import "server-only";
import { assetUrl, thumbUrl } from "@/lib/assets";
import { publicEnv } from "@/lib/env";
import {
  categoryInMenu,
  currentMenu,
  isVisibleAt,
  localClock,
  productPrice,
  tr,
  type ProductTag,
} from "@/domain/menu";
import type { Tenant } from "@/server/db/types";
import type { MenuData } from "./repo";

export type PublicOption = { id: string; name: string; priceDeltaCents: number; available: boolean };
export type PublicModifierGroup = {
  id: string;
  name: string;
  kind: "variant" | "addon" | "removal";
  minSelect: number;
  maxSelect: number;
  options: PublicOption[];
};
export type PublicProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  images: { full: string; thumb: string }[];
  allergens: number[];
  tags: ProductTag[];
  isFrozen: boolean;
  available: boolean;
  modifierGroups: PublicModifierGroup[];
  ayceIncluded: boolean;
  ayceMaxQty: number | null;
};
export type PublicCategory = { id: string; name: string; description: string; icon: string | null; parentId: string | null };

export type PublicMenu = {
  venue: {
    name: string;
    slug: string;
    logoUrl: string | null;
    coverUrl: string | null;
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    fontFamily: string;
    phone: string | null;
    address: string | null;
    mapsUrl: string | null;
    socials: Record<string, string>;
    reviewUrl: string | null;
    hoursToday: string[];
    closedNote: string | null;
    showPoweredBy: boolean;
    brandName: string;
    hasPrivacy: boolean;
    bookingEnabled: boolean;
    takeawayEnabled: boolean;
  };
  lang: string;
  languages: string[];
  menus: { id: string; name: string }[];
  menuId: string | null;
  categories: PublicCategory[];
  products: PublicProduct[];
  frozenNote: string;
  version: string | null;
};

function hoursToday(t: Tenant, now: Date): { hours: string[]; closedNote: string | null } {
  const { weekday } = localClock(now, t.settings.timezone);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: t.settings.timezone }).format(now); // YYYY-MM-DD
  const closure = (t.settings.closures ?? []).find((c) => c.from <= day && day <= c.to);
  if (closure) return { hours: [], closedNote: closure.note || "" };
  const hours = (t.settings.openingHours ?? [])
    .filter((h) => h.weekdays.includes(weekday))
    .map((h) => `${h.open}–${h.close}`);
  return { hours, closedNote: hours.length || !(t.settings.openingHours ?? []).length ? null : "" };
}

/**
 * Builds the customer menu for a language and menu at a given time:
 * applies active/visibility rules, hidden products, sold-out policy and the
 * menu's price list. Everything is resolved server-side.
 */
export function buildPublicMenu(
  t: Tenant,
  data: MenuData,
  opts: { lang: string; menuId?: string | null; now?: Date; brandName?: string },
): PublicMenu {
  const now = opts.now ?? new Date();
  const languages = t.modules.multilang ? t.settings.languages : ["it"];
  const lang = languages.includes(opts.lang) ? opts.lang : languages[0] ?? "it";
  const clock = localClock(now, t.settings.timezone);

  const activeMenus = data.menus.filter((m) => m.active);
  const menu = activeMenus.find((m) => m.id === opts.menuId) ?? currentMenu(data.menus, clock);
  const menuId = menu?.id ?? null;

  const categories = data.categories.filter((c) => c.active && isVisibleAt(c.visibility, clock) && categoryInMenu(c, menuId));
  // A subcategory is visible only if its parent is.
  const visibleIds = new Set(categories.map((c) => c.id));
  const cats = categories.filter((c) => !c.parentId || visibleIds.has(c.parentId));
  const catIds = new Set(cats.map((c) => c.id));

  const groups = new Map(data.modifierGroups.map((g) => [g.id, g]));
  const hideSoldOut = t.settings.soldOutBehavior === "hide";

  const products: PublicProduct[] = data.products
    .filter((p) => catIds.has(p.categoryId) && !p.hidden && (!hideSoldOut || p.available))
    .map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      name: tr(p.name, lang),
      description: tr(p.description, lang),
      priceCents: productPrice(p, menuId),
      images: p.images.map((img) => ({ full: assetUrl(img)!, thumb: thumbUrl(img)! })),
      allergens: [...p.allergens].sort((a, b) => a - b),
      tags: p.tags,
      isFrozen: p.isFrozen,
      available: p.available,
      ayceIncluded: p.ayceIncluded,
      ayceMaxQty: p.ayceMaxQty,
      modifierGroups: p.modifierGroupIds
        .map((id) => groups.get(id))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map((g) => ({
          id: g.id,
          name: tr(g.name, lang),
          kind: g.kind,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: tr(o.name, lang), priceDeltaCents: o.priceDeltaCents, available: o.available })),
        })),
    }));

  // Order categories: parents first, then their children right after them.
  const ordered: typeof cats = [];
  for (const c of cats.filter((c) => !c.parentId)) {
    ordered.push(c, ...cats.filter((x) => x.parentId === c.id));
  }
  const withProducts = new Set(products.map((p) => p.categoryId));

  const { hours, closedNote } = hoursToday(t, now);
  const addr = [t.address, t.postalCode, t.city].filter(Boolean).join(", ");

  return {
    venue: {
      name: t.displayName,
      slug: t.slug,
      logoUrl: assetUrl(t.branding.logoPath),
      coverUrl: assetUrl(t.branding.coverPath),
      primaryColor: t.branding.primaryColor,
      accentColor: t.branding.accentColor,
      backgroundColor: t.branding.backgroundColor,
      fontFamily: t.branding.fontFamily,
      phone: t.phone,
      address: addr || null,
      mapsUrl:
        t.lat != null && t.lng != null
          ? `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`
          : addr
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.displayName} ${addr}`)}`
            : null,
      socials: t.settings.socials ?? {},
      reviewUrl: t.settings.reviewUrl,
      hoursToday: hours,
      closedNote,
      showPoweredBy: t.showPoweredBy,
      brandName: opts.brandName ?? publicEnv.brandName,
      hasPrivacy: !!t.settings.privacyText,
      bookingEnabled: t.modules.reservations && !!t.settings.reservations?.onlineEnabled,
      takeawayEnabled: !!t.modules.takeaway && !!t.settings.takeaway?.enabled,
    },
    lang,
    languages,
    menus: activeMenus.map((m) => ({ id: m.id, name: tr(m.name, lang) })),
    menuId,
    categories: ordered
      .filter((c) => withProducts.has(c.id) || ordered.some((x) => x.parentId === c.id && withProducts.has(x.id)))
      .map((c) => ({ id: c.id, name: tr(c.name, lang), description: tr(c.description, lang), icon: c.icon, parentId: c.parentId })),
    products,
    frozenNote: tr(t.settings.frozenNote, lang),
    version: t.menuVersion ?? null,
  };
}

/** Picks the best language from Accept-Language among the available ones. */
export function negotiateLanguage(header: string | null, available: string[]): string {
  if (!header) return available[0] ?? "it";
  const prefs = header
    .split(",")
    .map((p) => {
      const [tag, q] = p.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return prefs.find((p) => available.includes(p.lang))?.lang ?? available[0] ?? "it";
}
