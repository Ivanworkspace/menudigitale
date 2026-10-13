/**
 * Takeaway (pickup) orders: configuration, pickup slots and statuses.
 * Orders are paid at pickup, at the till (no online payments).
 */
import { weekdayOf } from "./reservations";

export type TakeawayStatus = "pending" | "accepted" | "ready" | "picked_up" | "rejected";

export type TakeawayConfig = {
  enabled: boolean;
  /** Pickup windows, e.g. 12:00–14:30 and 19:00–22:30. */
  windows: { weekdays: number[]; from: string; to: string }[];
  slotMinutes: number;
  /** Minimum preparation time from "now" to the first pickup slot. */
  leadMinutes: number;
  maxOrdersPerSlot: number;
  /** Staff must accept every order before it reaches the kitchen. */
  manualAccept: boolean;
  minOrderCents: number;
  /** Price list used for takeaway (null = automatic by time). */
  menuId: string | null;
  /** Shown to customers on the order page (e.g. "Pagamento al ritiro"). */
  note: string;
};

export const DEFAULT_TAKEAWAY: TakeawayConfig = {
  enabled: false,
  windows: [
    { weekdays: [2, 3, 4, 5, 6, 7], from: "12:00", to: "14:30" },
    { weekdays: [2, 3, 4, 5, 6, 7], from: "19:00", to: "22:30" },
  ],
  slotMinutes: 15,
  leadMinutes: 20,
  maxOrdersPerSlot: 4,
  manualAccept: true,
  minOrderCents: 0,
  menuId: null,
  note: "Pagamento al ritiro, in contanti o con carta.",
};

export type TakeawayInfo = {
  number: number;
  day: string; // YYYY-MM-DD
  pickupTime: string; // HH:MM
  customerName: string;
  phone: string;
  status: TakeawayStatus;
  /** Hash of the customer's status-page token. */
  tokenHash: string;
  acceptedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  rejectReason: string | null;
  email?: string | null;
  /** Customer agreed to receive a review request after pickup. */
  reviewConsent?: boolean;
};

export const TAKEAWAY_STATUS_LABELS: Record<TakeawayStatus, string> = {
  pending: "Da confermare",
  accepted: "Confermato",
  ready: "Pronto",
  picked_up: "Ritirato",
  rejected: "Rifiutato",
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export type PickupSlot = { time: string; left: number };

/**
 * Pickup times still available today. `taken` counts active orders per
 * pickup time; `now` is the venue-local date/time.
 */
export function pickupSlots(
  cfg: TakeawayConfig,
  now: { date: string; time: string },
  taken: Record<string, number>,
  closed = false,
): PickupSlot[] {
  if (!cfg.enabled || closed) return [];
  const wd = weekdayOf(now.date);
  const earliest = toMin(now.time) + Math.max(0, cfg.leadMinutes);
  const step = Math.max(5, Math.floor(cfg.slotMinutes) || 15);
  const out = new Map<string, PickupSlot>();
  for (const w of cfg.windows) {
    if (w.weekdays.length && !w.weekdays.includes(wd)) continue;
    const end = Math.min(toMin(w.to), 23 * 60 + 59);
    for (let m = toMin(w.from); m <= end; m += step) {
      if (m < earliest) continue;
      const time = toTime(m);
      const left = cfg.maxOrdersPerSlot - (taken[time] ?? 0);
      if (left > 0) out.set(time, { time, left });
    }
  }
  return [...out.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/** Counts orders that still occupy a pickup slot. */
export function takenSlots(orders: Pick<TakeawayInfo, "pickupTime" | "status">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) if (o.status !== "rejected") out[o.pickupTime] = (out[o.pickupTime] ?? 0) + 1;
  return out;
}

/** Label shown on KDS, tickets and bills. */
export function takeawayLabel(number: number, name: string): string {
  const first = name.trim().split(/\s+/).slice(0, 2).join(" ").slice(0, 24);
  return `Asporto ${number}${first ? ` · ${first}` : ""}`;
}

export function isTakeawayLabel(label: string): boolean {
  return label.startsWith("Asporto ");
}

/** Compact form for KDS cards and lists: "Tav. 5" or "Asporto 3 · Rossi". */
export function shortPlaceLabel(label: string): string {
  return isTakeawayLabel(label) ? label : `Tav. ${label}`;
}

/** "Tavolo 5" or "Asporto 3 · Rossi" for notifications. */
export function placeLabel(label: string): string {
  return isTakeawayLabel(label) ? label : `Tavolo ${label}`;
}

const NEXT: Record<TakeawayStatus, TakeawayStatus[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["ready", "picked_up", "rejected"],
  ready: ["picked_up", "accepted"],
  picked_up: [],
  rejected: [],
};

export function canMoveTakeaway(from: TakeawayStatus, to: TakeawayStatus): boolean {
  return NEXT[from].includes(to);
}
