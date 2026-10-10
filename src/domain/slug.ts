export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

/** Slugs that would collide with routes or look official. */
export const RESERVED_SLUGS = new Set([
  "admin", "superadmin", "api", "app", "g", "m", "menu", "login", "logout", "static",
  "assets", "www", "help", "support", "assistenza", "demo-admin", "null", "undefined",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function validateSlug(slug: string): string | null {
  if (!SLUG_REGEX.test(slug)) return "Usa da 3 a 48 caratteri: lettere minuscole, numeri e trattini (non all'inizio o alla fine).";
  if (RESERVED_SLUGS.has(slug)) return "Questo indirizzo è riservato, scegline un altro.";
  return null;
}
