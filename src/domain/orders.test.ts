import { describe, it, expect } from "vitest";
import { currentMenuMode, newAccessCode, orderProgress, orderTotal, type OrderItem } from "./orders";

const item = (over: Partial<OrderItem>): OrderItem => ({
  id: "i", productId: "p", name: { it: "x" }, qty: 1, unitPriceCents: 1000, vatRateBp: 1000, modifiers: [], notes: "",
  course: 1, departmentId: null, ayceIncluded: false, status: "new", statusAt: "", ...over,
});

describe("orders", () => {
  it("derives customer progress", () => {
    expect(orderProgress({ status: "pending_approval", items: [item({})] })).toBe("pending");
    expect(orderProgress({ status: "sent", items: [item({}), item({ status: "in_progress" })] })).toBe("preparing");
    expect(orderProgress({ status: "sent", items: [item({ status: "ready" }), item({ status: "served" })] })).toBe("ready");
    expect(orderProgress({ status: "sent", items: [item({ status: "served" }), item({ status: "cancelled" })] })).toBe("served");
    expect(orderProgress({ status: "sent", items: [item({ status: "cancelled" })] })).toBe("cancelled");
  });
  it("totals exclude cancelled and AYCE-included items", () => {
    const items = [item({ qty: 2 }), item({ status: "cancelled" }), item({ ayceIncluded: true, unitPriceCents: 500 })];
    expect(orderTotal(items)).toBe(2500);
    expect(orderTotal(items, true)).toBe(2000);
  });
  it("picks the menu mode by time slot", () => {
    const sched = [{ weekdays: [], from: "19:00", to: "23:30", mode: "ayce" as const }];
    expect(currentMenuMode("table_orders", sched, { weekday: 3, time: "12:00" })).toBe("table_orders");
    expect(currentMenuMode("table_orders", sched, { weekday: 3, time: "20:00" })).toBe("ayce");
  });
  it("generates non-trivial codes", () => {
    for (let i = 0; i < 300; i++) expect(newAccessCode()).toMatch(/^\d{4}$/);
    let n = 0;
    const seq = [0, 0.1234, 0.5555, 0.4821];
    expect(newAccessCode(() => seq[n++])).toBe("4821");
  });
});
