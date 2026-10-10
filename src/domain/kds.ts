/**
 * Kitchen Display: derives per-department tickets from orders.
 * A ticket = the items of one order that belong to one department.
 */
import type { ItemStatus, Order, OrderItem } from "./orders";

export type Ticket = {
  key: string; // orderId:departmentId
  orderId: string;
  tableLabel: string;
  departmentId: string | null;
  sentAt: string;
  urgent: boolean;
  notes: string;
  source: Order["source"];
  createdByName: string | null;
  round: number | null;
  items: OrderItem[];
  status: "new" | "in_progress" | "ready" | "served";
  hasCancellations: boolean;
};

const ACTIVE: ItemStatus[] = ["new", "in_progress", "ready"];

export function ticketStatus(items: OrderItem[]): Ticket["status"] {
  const live = items.filter((i) => i.status !== "cancelled" && i.status !== "held");
  if (!live.length || live.every((i) => i.status === "served")) return "served";
  if (live.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (live.some((i) => i.status !== "new")) return "in_progress";
  return "new";
}

/**
 * Builds tickets for a department (null = all departments). Held items
 * (next course not yet released) are excluded; cancelled items are kept so
 * the kitchen sees the cancellation highlighted.
 */
export function buildTickets(orders: Order[], departmentId: string | null): Ticket[] {
  const tickets: Ticket[] = [];
  for (const o of orders) {
    if (o.status !== "sent") continue;
    const byDept = new Map<string, OrderItem[]>();
    for (const i of o.items) {
      if (i.status === "held") continue;
      if (departmentId && i.departmentId !== departmentId) continue;
      const k = departmentId ?? i.departmentId ?? "none";
      byDept.set(k, [...(byDept.get(k) ?? []), i]);
    }
    for (const [dept, items] of byDept) {
      if (!items.some((i) => ACTIVE.includes(i.status) || i.status === "cancelled")) continue;
      const status = ticketStatus(items);
      if (status === "served") continue;
      tickets.push({
        key: `${o.id}:${dept}`,
        orderId: o.id,
        tableLabel: o.tableLabel,
        departmentId: dept === "none" ? null : dept,
        sentAt: o.sentAt ?? o.createdAt,
        urgent: o.urgent,
        notes: o.notes,
        source: o.source,
        createdByName: o.createdByName,
        round: o.round,
        items,
        status,
        hasCancellations: items.some((i) => i.status === "cancelled"),
      });
    }
  }
  // Urgent first, then oldest first.
  return tickets.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.sentAt.localeCompare(b.sentAt));
}

export type WaitLevel = "ok" | "warn" | "late";

export function waitLevel(sentAt: string, now: Date, thresholds = { warnMin: 10, lateMin: 20 }): WaitLevel {
  const min = (now.getTime() - new Date(sentAt).getTime()) / 60_000;
  return min >= thresholds.lateMin ? "late" : min >= thresholds.warnMin ? "warn" : "ok";
}

/** Next status when tapping an item on the KDS. */
export function nextItemStatus(s: ItemStatus): ItemStatus | null {
  return s === "new" ? "in_progress" : s === "in_progress" ? "ready" : null;
}

/** Average preparation minutes per product from ready items (sentAt → readyAt). */
export function averagePrepMinutes(orders: (Pick<Order, "sentAt" | "createdAt"> & { items: (OrderItem & { readyAt?: string })[] })[]) {
  const acc = new Map<string, { name: string; total: number; n: number }>();
  for (const o of orders) {
    const start = new Date(o.sentAt ?? o.createdAt).getTime();
    for (const i of o.items) {
      if (!i.readyAt) continue;
      const m = (new Date(i.readyAt).getTime() - start) / 60_000;
      if (m < 0 || m > 240) continue;
      const cur = acc.get(i.productId) ?? { name: i.name.it ?? "", total: 0, n: 0 };
      cur.total += m * i.qty;
      cur.n += i.qty;
      acc.set(i.productId, cur);
    }
  }
  return [...acc.entries()].map(([productId, v]) => ({ productId, name: v.name, avgMinutes: v.total / v.n, count: v.n }));
}
