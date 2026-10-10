/**
 * Sales statistics from closed bills and orders. Pure aggregation.
 */
import type { Order } from "./orders";
import { tr } from "./menu";

export type StatBill = {
  businessDay: string; // YYYY-MM-DD (venue timezone)
  closedAt: string;
  totalCents: number;
  covers: number;
  tableSessionId: string;
  tableLabel: string;
  payments: { method: string; amountCents: number }[];
};

export type StatSession = { id: string; tableId: string; tableLabel: string; openedAt: string; closedAt: string | null; waiterId: string | null; waiterName: string | null; covers: number };

export type Summary = { revenueCents: number; bills: number; covers: number; avgTicketCents: number; avgPerCoverCents: number };

export function summarize(bills: StatBill[]): Summary {
  const revenueCents = bills.reduce((s, b) => s + b.totalCents, 0);
  const covers = bills.reduce((s, b) => s + b.covers, 0);
  return {
    revenueCents,
    bills: bills.length,
    covers,
    avgTicketCents: bills.length ? Math.round(revenueCents / bills.length) : 0,
    avgPerCoverCents: covers ? Math.round(revenueCents / covers) : 0,
  };
}

/** Percentage change, null when the previous value is 0. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function revenueByDay(bills: StatBill[], days: string[]): { day: string; cents: number }[] {
  const m = new Map(days.map((d) => [d, 0]));
  for (const b of bills) if (m.has(b.businessDay)) m.set(b.businessDay, m.get(b.businessDay)! + b.totalCents);
  return days.map((day) => ({ day, cents: m.get(day)! }));
}

export function revenueByHour(bills: StatBill[], timeZone = "Europe/Rome"): { hour: number; cents: number; bills: number }[] {
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone });
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, cents: 0, bills: 0 }));
  for (const b of bills) {
    const h = Number(fmt.format(new Date(b.closedAt))) % 24;
    rows[h].cents += b.totalCents;
    rows[h].bills += 1;
  }
  return rows;
}

export function byPaymentMethod(bills: StatBill[]) {
  const m = new Map<string, number>();
  for (const b of bills) for (const p of b.payments) m.set(p.method, (m.get(p.method) ?? 0) + p.amountCents);
  return [...m.entries()].map(([method, cents]) => ({ method, cents })).sort((a, b) => b.cents - a.cents);
}

export type ProductRow = { productId: string; name: string; qty: number; cents: number; categoryId: string | null };

/** Product sales from orders (cancelled items excluded). */
export function productSales(orders: Order[], categoryOf: (productId: string) => string | null): ProductRow[] {
  const m = new Map<string, ProductRow>();
  for (const o of orders) {
    if (o.status !== "sent") continue;
    for (const i of o.items) {
      if (i.status === "cancelled") continue;
      const r = m.get(i.productId) ?? { productId: i.productId, name: tr(i.name, "it"), qty: 0, cents: 0, categoryId: categoryOf(i.productId) };
      r.qty += i.qty;
      r.cents += i.qty * i.unitPriceCents;
      m.set(i.productId, r);
    }
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || b.cents - a.cents);
}

export function categorySales(products: ProductRow[], categoryName: (id: string | null) => string) {
  const m = new Map<string, { name: string; qty: number; cents: number }>();
  for (const p of products) {
    const key = p.categoryId ?? "none";
    const r = m.get(key) ?? { name: categoryName(p.categoryId), qty: 0, cents: 0 };
    r.qty += p.qty;
    r.cents += p.cents;
    m.set(key, r);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents);
}

/** Revenue and covers per waiter (by the session's assigned waiter). */
export function waiterPerformance(bills: StatBill[], sessions: Map<string, StatSession>, orders: Order[]) {
  const m = new Map<string, { name: string; revenueCents: number; tables: number; covers: number; orders: number }>();
  const get = (id: string, name: string) => m.get(id) ?? { name, revenueCents: 0, tables: 0, covers: 0, orders: 0 };
  for (const b of bills) {
    const s = sessions.get(b.tableSessionId);
    if (!s?.waiterId) continue;
    const r = get(s.waiterId, s.waiterName ?? "—");
    r.revenueCents += b.totalCents;
    r.tables += 1;
    r.covers += b.covers;
    m.set(s.waiterId, r);
  }
  for (const o of orders) {
    if (!o.createdBy || o.source !== "waiter") continue;
    const r = get(o.createdBy, o.createdByName ?? "—");
    r.orders += 1;
    m.set(o.createdBy, r);
  }
  return [...m.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Table stats: turns (sessions) and average stay in minutes. */
export function tableStats(sessions: StatSession[]) {
  const m = new Map<string, { label: string; turns: number; minutes: number }>();
  for (const s of sessions) {
    if (!s.closedAt) continue;
    const r = m.get(s.tableId) ?? { label: s.tableLabel, turns: 0, minutes: 0 };
    r.turns += 1;
    r.minutes += Math.max(0, (new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / 60_000);
    m.set(s.tableId, r);
  }
  return [...m.values()]
    .map((r) => ({ label: r.label, turns: r.turns, avgMinutes: Math.round(r.minutes / r.turns) }))
    .sort((a, b) => b.turns - a.turns || a.label.localeCompare(b.label, "it", { numeric: true }));
}
