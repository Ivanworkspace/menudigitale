/**
 * Reservations: time slots and capacity.
 */
export type ReservationStatus = "pending" | "confirmed" | "arrived" | "no_show" | "cancelled";

export type ReservationConfig = {
  onlineEnabled: boolean;
  /** Bookable windows, e.g. lunch 12:00–14:00 and dinner 19:00–22:00 every 15 min. */
  slots: { weekdays: number[]; from: string; to: string; intervalMin: number }[];
  maxCoversPerSlot: number;
  maxPartySize: number;
  /** Minimum notice for online bookings, in minutes. */
  leadTimeMin: number;
  /** How far ahead online bookings are allowed, in days. */
  maxDaysAhead: number;
  durationMin: number;
  autoConfirm: boolean;
};

export const DEFAULT_RESERVATIONS: ReservationConfig = {
  onlineEnabled: false,
  slots: [
    { weekdays: [2, 3, 4, 5, 6, 7], from: "12:00", to: "14:00", intervalMin: 15 },
    { weekdays: [2, 3, 4, 5, 6, 7], from: "19:00", to: "22:00", intervalMin: 15 },
  ],
  maxCoversPerSlot: 20,
  maxPartySize: 10,
  leadTimeMin: 60,
  maxDaysAhead: 60,
  durationMin: 90,
  autoConfirm: false,
};

export type Reservation = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  covers: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMin: number;
  notes: string;
  tableId: string | null;
  status: ReservationStatus;
  source: "staff" | "online" | "phone";
  customerId: string | null;
  /** Customer agreed to receive a review request after the visit. */
  reviewConsent?: boolean;
  createdAt: string;
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "In attesa",
  confirmed: "Confermata",
  arrived: "Arrivata",
  no_show: "No-show",
  cancelled: "Annullata",
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** ISO weekday of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Covers already booked overlapping a time (reservation duration aware). */
export function coversAt(existing: Pick<Reservation, "time" | "durationMin" | "covers" | "status">[], time: string): number {
  const t = toMin(time);
  return existing
    .filter((r) => r.status !== "cancelled" && r.status !== "no_show")
    .filter((r) => toMin(r.time) <= t && t < toMin(r.time) + r.durationMin)
    .reduce((s, r) => s + r.covers, 0);
}

export type Slot = { time: string; available: number };

/**
 * Bookable times for a date and party size. `now` is the venue-local
 * current date/time ("YYYY-MM-DD", "HH:MM") to apply the lead time.
 */
export function availableSlots(
  cfg: ReservationConfig,
  existing: Pick<Reservation, "time" | "durationMin" | "covers" | "status">[],
  date: string,
  party: number,
  now: { date: string; time: string },
  closedDates: string[] = [],
): Slot[] {
  if (party < 1 || party > cfg.maxPartySize) return [];
  if (date < now.date || closedDates.includes(date)) return [];
  const daysAhead = (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${now.date}T12:00:00Z`).getTime()) / 86_400_000;
  if (daysAhead > cfg.maxDaysAhead) return [];
  const wd = weekdayOf(date);
  const out: Slot[] = [];
  for (const s of cfg.slots) {
    if (s.weekdays.length && !s.weekdays.includes(wd)) continue;
    for (let m = toMin(s.from); m <= toMin(s.to); m += Math.max(5, s.intervalMin)) {
      const time = toTime(m);
      if (date === now.date && m < toMin(now.time) + cfg.leadTimeMin) continue;
      const available = cfg.maxCoversPerSlot - coversAt(existing, time);
      if (available >= party && !out.some((x) => x.time === time)) out.push({ time, available });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}
