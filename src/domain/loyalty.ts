/**
 * Customers, loyalty (points or stamps) and promotions.
 */
import { isVisibleAt, type Visibility } from "./menu";

export type LoyaltyConfig = {
  enabled: boolean;
  mode: "points" | "stamps";
  pointsPerEuro: number;
  /** Minimum bill for a stamp, in cents. */
  stampMinCents: number;
  rewards: { id: string; name: string; cost: number; description: string }[];
};

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: true,
  mode: "points",
  pointsPerEuro: 1,
  stampMinCents: 1000,
  rewards: [
    { id: "dessert", name: "Dolce omaggio", cost: 50, description: "Un dolce a scelta" },
    { id: "discount10", name: "Sconto 10 €", cost: 120, description: "Sul prossimo conto" },
  ],
};

export function earned(cfg: LoyaltyConfig, billCents: number): { points: number; stamps: number } {
  if (!cfg.enabled || billCents <= 0) return { points: 0, stamps: 0 };
  if (cfg.mode === "stamps") return { points: 0, stamps: billCents >= cfg.stampMinCents ? 1 : 0 };
  return { points: Math.floor((billCents / 100) * cfg.pointsPerEuro), stamps: 0 };
}

export type Promotion = {
  id: string;
  name: string;
  kind: "happy_hour" | "code";
  code: string | null;
  mode: "percent" | "amount";
  value: number; // bp or cents
  schedule: Visibility | null;
  validFrom: string | null; // YYYY-MM-DD
  validTo: string | null;
  maxUses: number | null;
  uses: number;
  minSpendCents: number;
  active: boolean;
};

export type PromoCheck = { ok: true } | { ok: false; reason: string };

export function checkPromotion(p: Promotion, ctx: { date: string; clock: { weekday: number; time: string }; subtotalCents: number }): PromoCheck {
  if (!p.active) return { ok: false, reason: "Promozione non attiva." };
  if (p.validFrom && ctx.date < p.validFrom) return { ok: false, reason: "Promozione non ancora valida." };
  if (p.validTo && ctx.date > p.validTo) return { ok: false, reason: "Promozione scaduta." };
  if (p.maxUses != null && p.uses >= p.maxUses) return { ok: false, reason: "Codice esaurito." };
  if (ctx.subtotalCents < p.minSpendCents) return { ok: false, reason: `Spesa minima ${(p.minSpendCents / 100).toFixed(2).replace(".", ",")} €.` };
  if (p.schedule && !isVisibleAt(p.schedule, ctx.clock)) return { ok: false, reason: "Fuori dall'orario della promozione." };
  return { ok: true };
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return digits.startsWith("3") || digits.startsWith("0") ? `+39${digits}` : `+${digits}`;
}
