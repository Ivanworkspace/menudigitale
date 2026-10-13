/**
 * Automatic review requests: the day after a visit (reservation marked
 * "arrived") or a collected takeaway, customers who opted in receive one
 * invitation to review the venue. Every opted-in customer gets the same
 * link: no filtering by satisfaction ("review gating" violates Google's
 * policies), no incentives.
 */
export type ReviewConfig = {
  enabled: boolean;
  fromReservations: boolean;
  fromTakeaway: boolean;
  /** Do not ask the same contact again within this many days. */
  cooldownDays: number;
  /** Placeholders: {nome}, {locale}, {link}. */
  message: string;
};

export const DEFAULT_REVIEWS: ReviewConfig = {
  enabled: false,
  fromReservations: true,
  fromTakeaway: true,
  cooldownDays: 90,
  message:
    "Ciao {nome}, grazie per aver scelto {locale}! Se hai un minuto, ci aiuteresti molto lasciando una recensione: {link}\nA presto!",
};

export type ReviewSource = "reservation" | "takeaway";
export type ReviewStatus = "queued" | "to_send" | "sent" | "clicked" | "skipped";

export type ReviewRequest = {
  id: string;
  source: ReviewSource;
  sourceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Hashes of the normalized contacts, for cooldown and opt-out checks. */
  contactKeys: string[];
  visitDay: string; // YYYY-MM-DD
  sendOn: string; // YYYY-MM-DD (the day after the visit)
  /** queued → email sent by the morning job; to_send → staff sends it via WhatsApp. */
  status: ReviewStatus;
  channel: "email" | "whatsapp" | null;
  createdAt: string;
  sentAt: string | null;
  clickedAt: string | null;
  skipReason: string | null;
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  queued: "In programma (email)",
  to_send: "Da inviare su WhatsApp",
  sent: "Inviata",
  clicked: "Link aperto",
  skipped: "Non inviata",
};

export function renderReviewMessage(template: string, vars: { name: string; venue: string; link: string }): string {
  const first = vars.name.trim().split(/\s+/)[0] ?? "";
  const out = template.replaceAll("{nome}", first).replaceAll("{locale}", vars.venue).replaceAll("{link}", vars.link);
  // A message without the link would be useless: append it.
  return template.includes("{link}") ? out : `${out}\n${vars.link}`;
}

/** Normalized contact strings used for cooldown / opt-out lookups. */
export function contactStrings(c: { email?: string | null; phone?: string | null }): string[] {
  const out: string[] = [];
  if (c.email) out.push(`e:${c.email.trim().toLowerCase()}`);
  const digits = (c.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 8) out.push(`p:${digits.slice(-10)}`);
  return out;
}

/** True if a previous request to the same contact is within the cooldown. */
export function inCooldown(previousCreatedAt: string[], cooldownDays: number, now: Date): boolean {
  const limit = now.getTime() - cooldownDays * 86_400_000;
  return previousCreatedAt.some((d) => new Date(d).getTime() >= limit);
}

/** Basic check that the review link looks like a public review page. */
export function isValidReviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}
