import { describe, it, expect } from "vitest";
import { summarize, delta, eachDay, revenueByDay, revenueByHour, productSales, categorySales, tableStats, byPaymentMethod } from "./stats";
import type { Order } from "./orders";

const bill = (day: string, cents: number, covers: number, at = `${day}T19:30:00Z`) => ({
  businessDay: day, closedAt: at, totalCents: cents, covers, tableSessionId: "s", tableLabel: "1",
  payments: [{ method: "cash", amountCents: cents }],
});

describe("stats", () => {
  it("summarizes", () => {
    expect(summarize([bill("2026-10-01", 3000, 2), bill("2026-10-01", 5000, 3)])).toEqual({
      revenueCents: 8000, bills: 2, covers: 5, avgTicketCents: 4000, avgPerCoverCents: 1600,
    });
    expect(summarize([])).toMatchObject({ avgTicketCents: 0, avgPerCoverCents: 0 });
  });
  it("delta", () => {
    expect(delta(120, 100)).toBe(20);
    expect(delta(50, 0)).toBeNull();
  });
  it("days and revenue by day", () => {
    const days = eachDay("2026-10-30", "2026-11-02");
    expect(days).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(revenueByDay([bill("2026-10-31", 100, 1), bill("2026-10-31", 50, 1)], days).map((d) => d.cents)).toEqual([0, 150, 0, 0]);
  });
  it("revenue by hour in Rome time", () => {
    const rows = revenueByHour([bill("2026-10-01", 1000, 1, "2026-10-01T19:30:00Z")]);
    expect(rows[21].cents).toBe(1000); // 21:30 CEST
  });
  it("payment methods", () => {
    expect(byPaymentMethod([bill("2026-10-01", 1000, 1)])).toEqual([{ method: "cash", cents: 1000 }]);
  });
  it("product and category sales skip cancelled", () => {
    const o = {
      status: "sent",
      items: [
        { productId: "a", name: { it: "Pizza" }, qty: 2, unitPriceCents: 800, status: "served" },
        { productId: "a", name: { it: "Pizza" }, qty: 1, unitPriceCents: 800, status: "cancelled" },
        { productId: "b", name: { it: "Birra" }, qty: 3, unitPriceCents: 400, status: "served" },
      ],
    } as unknown as Order;
    const p = productSales([o], (id) => (id === "a" ? "pizze" : "bev"));
    expect(p).toEqual([
      { productId: "b", name: "Birra", qty: 3, cents: 1200, categoryId: "bev" },
      { productId: "a", name: "Pizza", qty: 2, cents: 1600, categoryId: "pizze" },
    ]);
    expect(categorySales(p, (id) => id ?? "")[0]).toEqual({ name: "pizze", qty: 2, cents: 1600 });
  });
  it("table stats", () => {
    const s = [
      { id: "1", tableId: "t1", tableLabel: "1", openedAt: "2026-10-01T19:00:00Z", closedAt: "2026-10-01T20:30:00Z", waiterId: null, waiterName: null, covers: 2 },
      { id: "2", tableId: "t1", tableLabel: "1", openedAt: "2026-10-01T21:00:00Z", closedAt: "2026-10-01T22:00:00Z", waiterId: null, waiterName: null, covers: 2 },
    ];
    expect(tableStats(s)).toEqual([{ label: "1", turns: 2, avgMinutes: 75 }]);
  });
});
