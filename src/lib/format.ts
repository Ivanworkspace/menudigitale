const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
});
const rtf = new Intl.RelativeTimeFormat("it-IT", { numeric: "auto" });

export const formatEuro = (cents: number | null | undefined) => (cents == null ? "—" : eur.format(cents / 100));
export const formatDate = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const formatDateTime = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");

export function formatRelative(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return "mai";
  const diff = (new Date(d).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}

/** "12,50" | "12.50" | "12" -> 1250 */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** 23:59:59 Europe/Rome of a "YYYY-MM-DD" date, as a Date (DST-aware). */
export function romeEndOfDay(day: string): Date {
  for (const offset of ["+02:00", "+01:00"]) {
    const d = new Date(`${day}T23:59:59${offset}`);
    const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Rome" }).format(d);
    if (hour === "23") return d;
  }
  return new Date(`${day}T23:59:59+01:00`);
}
