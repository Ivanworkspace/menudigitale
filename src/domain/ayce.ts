/**
 * All You Can Eat rules: per-person pricing by slot, rounds with a piece
 * limit and a minimum interval, per-product limits, max stay, bill total.
 */
export type AyceSlot = "lunch" | "dinner" | "holiday";

export type AyceConfig = {
  prices: Record<AyceSlot, { adultCents: number; childCents: number }>;
  /** Lunch pricing applies before this time ("HH:MM"). */
  lunchUntil: string;
  /** ISO dates (YYYY-MM-DD) priced as holidays; weekends use `weekendAsHoliday`. */
  holidays: string[];
  weekendAsHoliday: boolean;
  piecesPerPersonPerRound: number;
  minRoundIntervalSec: number;
  maxStayMin: number | null;
  leftoverPenaltyNote: string | null;
};

export const DEFAULT_AYCE: AyceConfig = {
  prices: {
    lunch: { adultCents: 1590, childCents: 990 },
    dinner: { adultCents: 2590, childCents: 1490 },
    holiday: { adultCents: 2790, childCents: 1590 },
  },
  lunchUntil: "16:00",
  holidays: [],
  weekendAsHoliday: false,
  piecesPerPersonPerRound: 5,
  minRoundIntervalSec: 600,
  maxStayMin: null,
  leftoverPenaltyNote: "I piatti avanzati potranno essere addebitati a prezzo di listino.",
};

export function ayceSlot(cfg: AyceConfig, clock: { weekday: number; time: string; date: string }): AyceSlot {
  if (cfg.holidays.includes(clock.date) || (cfg.weekendAsHoliday && clock.weekday >= 6)) return "holiday";
  return clock.time < cfg.lunchUntil ? "lunch" : "dinner";
}

export type AyceSession = {
  covers: number;
  coversChildren: number;
  openedAt: string;
  lastRoundAt: string | null;
  /** Included quantities already ordered in this session, by product. */
  includedQtyByProduct: Record<string, number>;
};

export type AyceLine = { productId: string; qty: number; included: boolean; maxQty: number | null };

export type AyceCheck =
  | { ok: true; includedPieces: number }
  | { ok: false; reason: "no_covers" | "too_many_pieces" | "too_soon" | "product_limit" | "stay_expired"; message: string; waitSec?: number };

export function checkAyceRound(cfg: AyceConfig, s: AyceSession, lines: AyceLine[], now: Date): AyceCheck {
  const persons = s.covers + s.coversChildren;
  const included = lines.filter((l) => l.included);
  const pieces = included.reduce((n, l) => n + l.qty, 0);
  if (pieces === 0) return { ok: true, includedPieces: 0 }; // extras only: always allowed
  if (persons <= 0) return { ok: false, reason: "no_covers", message: "Numero di coperti non impostato: chiedi al cameriere." };

  if (cfg.maxStayMin && now.getTime() - new Date(s.openedAt).getTime() > cfg.maxStayMin * 60_000) {
    return { ok: false, reason: "stay_expired", message: "Il tempo massimo di permanenza è terminato." };
  }
  if (s.lastRoundAt) {
    const elapsed = (now.getTime() - new Date(s.lastRoundAt).getTime()) / 1000;
    if (elapsed < cfg.minRoundIntervalSec) {
      const waitSec = Math.ceil(cfg.minRoundIntervalSec - elapsed);
      return { ok: false, reason: "too_soon", message: `Il prossimo giro sarà disponibile tra ${formatWait(waitSec)}.`, waitSec };
    }
  }
  const max = cfg.piecesPerPersonPerRound * persons;
  if (pieces > max) {
    return { ok: false, reason: "too_many_pieces", message: `Massimo ${max} pezzi per giro (${cfg.piecesPerPersonPerRound} a persona).` };
  }
  const byProduct = new Map<string, number>();
  for (const l of included) byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.qty);
  for (const l of included) {
    if (l.maxQty == null) continue;
    const total = (s.includedQtyByProduct[l.productId] ?? 0) + (byProduct.get(l.productId) ?? 0);
    if (total > l.maxQty) {
      return { ok: false, reason: "product_limit", message: `Limite raggiunto per un prodotto (max ${l.maxQty} per tavolo).` };
    }
  }
  return { ok: true, includedPieces: pieces };
}

/** Seconds until the next round may be sent (0 = now). */
export function secondsToNextRound(cfg: AyceConfig, lastRoundAt: string | null, now: Date): number {
  if (!lastRoundAt) return 0;
  return Math.max(0, Math.ceil(cfg.minRoundIntervalSec - (now.getTime() - new Date(lastRoundAt).getTime()) / 1000));
}

export function ayceCoverTotal(cfg: AyceConfig, slot: AyceSlot, covers: number, children: number): number {
  const p = cfg.prices[slot];
  return covers * p.adultCents + children * p.childCents;
}

function formatWait(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
