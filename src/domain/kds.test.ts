import { describe, it, expect } from "vitest";
import { buildTickets, ticketStatus, waitLevel, nextItemStatus, averagePrepMinutes } from "./kds";
import { kitchenTicket, toPrintable } from "./escpos";
import type { Order, OrderItem } from "./orders";

const item = (over: Partial<OrderItem>): OrderItem => ({
  id: Math.random().toString(36).slice(2), productId: "p", name: { it: "Pizza" }, qty: 1, unitPriceCents: 800, vatRateBp: 1000,
  modifiers: [], notes: "", course: 1, departmentId: "pizzeria", ayceIncluded: false, status: "new", statusAt: "", ...over,
});
const order = (over: Partial<Order>): Order => ({
  id: "o1", tableSessionId: "s", tableId: "t", tableLabel: "5", source: "waiter", status: "sent", approvalReason: null,
  items: [], notes: "", round: null, totalCents: 0, createdAt: "2026-10-09T19:00:00Z", sentAt: "2026-10-09T19:00:00Z",
  createdBy: null, createdByName: "Luca", deviceId: null, approvedBy: null, urgent: false, ...over,
});

describe("kds tickets", () => {
  it("splits orders by department and skips held/pending", () => {
    const o = order({ items: [item({}), item({ departmentId: "bar", name: { it: "Birra" } }), item({ status: "held", course: 2 })] });
    expect(buildTickets([o], "pizzeria")).toHaveLength(1);
    expect(buildTickets([o], "pizzeria")[0].items).toHaveLength(1);
    expect(buildTickets([o], null)).toHaveLength(2);
    expect(buildTickets([order({ status: "pending_approval", items: [item({})] })], null)).toHaveLength(0);
  });
  it("orders urgent first then oldest", () => {
    const a = order({ id: "a", sentAt: "2026-10-09T19:00:00Z", items: [item({})] });
    const b = order({ id: "b", sentAt: "2026-10-09T19:10:00Z", urgent: true, items: [item({})] });
    const c = order({ id: "c", sentAt: "2026-10-09T18:50:00Z", items: [item({})] });
    expect(buildTickets([a, b, c], "pizzeria").map((t) => t.orderId)).toEqual(["b", "c", "a"]);
  });
  it("derives ticket status and hides served", () => {
    expect(ticketStatus([item({ status: "ready" }), item({ status: "in_progress" })])).toBe("in_progress");
    expect(ticketStatus([item({ status: "ready" }), item({ status: "cancelled" })])).toBe("ready");
    expect(buildTickets([order({ items: [item({ status: "served" })] })], null)).toHaveLength(0);
  });
  it("highlights cancellations", () => {
    const t = buildTickets([order({ items: [item({}), item({ status: "cancelled" })] })], null)[0];
    expect(t.hasCancellations).toBe(true);
  });
  it("wait levels", () => {
    const now = new Date("2026-10-09T19:15:00Z");
    expect(waitLevel("2026-10-09T19:10:00Z", now)).toBe("ok");
    expect(waitLevel("2026-10-09T19:04:00Z", now)).toBe("warn");
    expect(waitLevel("2026-10-09T18:50:00Z", now)).toBe("late");
  });
  it("status cycle", () => {
    expect(nextItemStatus("new")).toBe("in_progress");
    expect(nextItemStatus("in_progress")).toBe("ready");
    expect(nextItemStatus("ready")).toBeNull();
  });
  it("average prep time", () => {
    const o = { sentAt: "2026-10-09T19:00:00Z", createdAt: "", items: [{ ...item({ qty: 2 }), readyAt: "2026-10-09T19:12:00Z" }, { ...item({}), readyAt: "2026-10-09T19:06:00Z" }] };
    const [r] = averagePrepMinutes([o]);
    expect(r.avgMinutes).toBe(10);
    expect(r.count).toBe(3);
  });
});

describe("escpos", () => {
  it("transliterates", () => {
    expect(toPrintable("Caffè 2,50 € — “ok”")).toBe('Caffe 2,50 EUR - "ok"');
  });
  it("builds a ticket starting with init and ending with cut", () => {
    const b = kitchenTicket({
      venue: "Da Mario", department: "Pizzeria", table: "5", waiter: "Luca", time: "20:15", urgent: true, round: null, notes: "allergia",
      items: [{ qty: 2, name: "Margherita", modifiers: ["Bufala"], notes: "ben cotta", course: 1 }],
    });
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const text = Buffer.from(b).toString("latin1");
    expect(text).toContain("TAVOLO 5");
    expect(text).toContain("2 x Margherita");
    expect(text).toContain("URGENTE");
  });
});
