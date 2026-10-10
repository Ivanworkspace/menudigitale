import "server-only";
import { refs, allWithId } from "@/server/db";
import { loadMenuData } from "@/server/menu/repo";
import {
  byPaymentMethod,
  categorySales,
  eachDay,
  productSales,
  revenueByDay,
  revenueByHour,
  summarize,
  tableStats,
  waiterPerformance,
  type StatBill,
  type StatSession,
} from "@/domain/stats";
import type { Order } from "@/domain/orders";
import type { Tenant } from "@/server/db/types";

export type Range = { from: string; to: string };

/** Resolves a preset or explicit range into venue-local days. */
export function resolveRange(tz: string, sp: { periodo?: string; da?: string; a?: string }): Range & { label: string } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const shift = (d: string, n: number) => {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (ok(sp.da) && ok(sp.a) && sp.da! <= sp.a!) return { from: sp.da!, to: sp.a!, label: "Personalizzato" };
  switch (sp.periodo) {
    case "oggi":
      return { from: today, to: today, label: "Oggi" };
    case "30g":
      return { from: shift(today, -29), to: today, label: "Ultimi 30 giorni" };
    case "mese":
      return { from: `${today.slice(0, 7)}-01`, to: today, label: "Questo mese" };
    case "anno":
      return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "Quest'anno" };
    default:
      return { from: shift(today, -6), to: today, label: "Ultimi 7 giorni" };
  }
}

export function previousRange(r: Range): Range {
  const days = eachDay(r.from, r.to).length;
  const end = new Date(`${r.from}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

async function bills(tenantId: string, r: Range): Promise<StatBill[]> {
  const snap = await refs.bills(tenantId).where("businessDay", ">=", r.from).where("businessDay", "<=", r.to).get();
  return snap.docs
    .map((d) => d.data())
    .filter((b) => b.status === "paid")
    .map((b) => ({
      businessDay: b.businessDay,
      closedAt: b.closedAt,
      totalCents: b.totals.totalCents,
      covers: (b.covers ?? 0) + (b.coversChildren ?? 0),
      tableSessionId: b.tableSessionId,
      tableLabel: b.tableLabel,
      payments: b.payments ?? [],
    }));
}

export async function loadStats(tenant: Tenant, r: Range) {
  const t = tenant.id;
  // Generous UTC window around the local days; bills are filtered by businessDay.
  const fromIso = new Date(`${r.from}T00:00:00Z`).getTime() - 3 * 3600_000;
  const toIso = new Date(`${r.to}T23:59:59Z`).getTime() + 3 * 3600_000;
  const [cur, prev, orders, sessions, menu, analytics] = await Promise.all([
    bills(t, r),
    bills(t, previousRange(r)),
    refs.orders(t).where("createdAt", ">=", new Date(fromIso).toISOString()).where("createdAt", "<=", new Date(toIso).toISOString()).get().then(allWithId<Order>),
    refs.tableSessions(t).where("openedAt", ">=", new Date(fromIso).toISOString()).where("openedAt", "<=", new Date(toIso).toISOString()).get().then(allWithId<StatSession>),
    loadMenuData(t),
    refs.analytics(t).where("day", ">=", r.from).where("day", "<=", r.to).get(),
  ]);
  const days = eachDay(r.from, r.to);
  const catOf = new Map(menu.products.map((p) => [p.id, p.categoryId]));
  const catName = new Map(menu.categories.map((c) => [c.id, c.name.it ?? ""]));
  const products = productSales(orders, (id) => catOf.get(id) ?? null);
  const allProducts = menu.products.map((p) => ({ id: p.id, name: p.name.it ?? "" }));
  const sold = new Set(products.map((p) => p.productId));
  let menuViews = 0;
  let qrScans = 0;
  const productViews = new Map<string, number>();
  for (const d of analytics.docs) {
    menuViews += d.get("menuViews") ?? 0;
    qrScans += d.get("qrScans") ?? 0;
    for (const [id, n] of Object.entries((d.get("productViews") ?? {}) as Record<string, number>)) productViews.set(id, (productViews.get(id) ?? 0) + n);
  }
  const productName = new Map(allProducts.map((p) => [p.id, p.name]));
  return {
    summary: summarize(cur),
    previous: summarize(prev),
    orders: orders.filter((o) => o.status === "sent").length,
    daily: revenueByDay(cur, days),
    hourly: revenueByHour(cur, tenant.settings.timezone),
    payments: byPaymentMethod(cur),
    products,
    unsold: allProducts.filter((p) => !sold.has(p.id)),
    categories: categorySales(products, (id) => (id ? (catName.get(id) ?? "—") : "—")),
    waiters: waiterPerformance(cur, new Map(sessions.map((s) => [s.id, s])), orders),
    tables: tableStats(sessions),
    menuViews,
    qrScans,
    productViews: [...productViews.entries()]
      .map(([id, n]) => ({ name: productName.get(id) ?? "—", views: n }))
      .sort((a, b) => b.views - a.views),
  };
}
