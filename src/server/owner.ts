import "server-only";
import { refs, allWithId } from "@/server/db";
import { stockLevel, type Ingredient } from "@/domain/inventory";
import { shiftDay } from "@/domain/push";
import type { TableSession } from "@/domain/orders";
import type { Tenant } from "@/server/db/types";

type DayTotals = { revenueCents: number; bills: number; covers: number };

export function venueDay(t: Tenant, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: t.settings.timezone }).format(at);
}

/** Paid bills of a range of business days, totalled per day. */
export async function dailyTotals(tenantId: string, from: string, to: string): Promise<Map<string, DayTotals>> {
  const snap = await refs.bills(tenantId).where("businessDay", ">=", from).where("businessDay", "<=", to).get();
  const out = new Map<string, DayTotals>();
  for (const d of snap.docs) {
    if (d.get("status") !== "paid") continue;
    const day = d.get("businessDay") as string;
    const r = out.get(day) ?? { revenueCents: 0, bills: 0, covers: 0 };
    r.revenueCents += (d.get("totals.totalCents") as number) ?? 0;
    r.bills += 1;
    r.covers += ((d.get("covers") as number) ?? 0) + ((d.get("coversChildren") as number) ?? 0);
    out.set(day, r);
  }
  return out;
}

const EMPTY: DayTotals = { revenueCents: 0, bills: 0, covers: 0 };

/** Everything the owner app shows, in one round of queries. */
export async function ownerSnapshot(t: Tenant) {
  const today = venueDay(t);
  const from = shiftDay(today, -13);
  const since = new Date(Date.now() - 18 * 3600_000).toISOString();
  const [totals, sessions, pendingOrders, blocks, reservations, ingredients, soldOut] = await Promise.all([
    t.modules.billing ? dailyTotals(t.id, from, today) : Promise.resolve(new Map<string, DayTotals>()),
    refs.tableSessions(t.id).where("status", "in", ["open", "bill_requested"]).get().then(allWithId<TableSession>),
    // Takeaway approvals are counted separately below.
    refs.orders(t.id).where("status", "==", "pending_approval").get().then((s) => s.docs.filter((d) => d.get("source") !== "takeaway").length),
    refs.orderBlocks(t.id).where("createdAt", ">=", since).count().get().then((s) => s.data().count),
    t.modules.reservations ? refs.reservations(t.id).where("date", "==", today).get() : Promise.resolve(null),
    t.modules.inventory ? refs.ingredients(t.id).get().then(allWithId<Ingredient>) : Promise.resolve([] as Ingredient[]),
    refs.products(t.id).where("available", "==", false).get().then((s) => s.docs.map((d) => (d.get("name.it") as string) ?? "")),
  ]);

  const tables = sessions.filter((s) => !s.takeaway);
  const takeaway = sessions.filter((s) => s.takeaway);
  const resActive = reservations?.docs.filter((d) => !["cancelled", "no_show"].includes(d.get("status") as string)) ?? [];
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    return { day, ...(totals.get(day) ?? EMPTY) };
  });

  return {
    today,
    billing: t.modules.billing,
    now: totals.get(today) ?? EMPTY,
    lastWeek: totals.get(shiftDay(today, -7)) ?? EMPTY,
    last7,
    prev7RevenueCents: Array.from({ length: 7 }, (_, i) => totals.get(shiftDay(today, i - 13))?.revenueCents ?? 0).reduce((a, b) => a + b, 0),
    room: {
      openTables: tables.length,
      covers: tables.reduce((n, s) => n + s.covers + s.coversChildren, 0),
      valueCents: tables.reduce((n, s) => n + (s.totalCents ?? 0), 0),
      billRequested: tables.filter((s) => s.status === "bill_requested").length,
    },
    takeaway: t.modules.takeaway
      ? {
          pending: takeaway.filter((s) => s.takeaway?.status === "pending").length,
          active: takeaway.filter((s) => s.takeaway?.status === "accepted" || s.takeaway?.status === "ready").length,
          valueCents: takeaway.reduce((n, s) => n + (s.totalCents ?? 0), 0),
        }
      : null,
    pendingOrders,
    blocks,
    reservations: reservations ? { count: resActive.length, covers: resActive.reduce((n, d) => n + ((d.get("covers") as number) ?? 0), 0) } : null,
    lowStock: ingredients.filter((i) => i.active && stockLevel(i) !== "ok").map((i) => ({ name: i.name, out: stockLevel(i) === "out" })),
    soldOut: soldOut.filter(Boolean),
  };
}

export type OwnerSnapshot = Awaited<ReturnType<typeof ownerSnapshot>>;
