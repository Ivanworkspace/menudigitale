import { describe, expect, it } from "vitest";
import { canMoveTakeaway, DEFAULT_TAKEAWAY, pickupSlots, placeLabel, takeawayLabel, takenSlots } from "./takeaway";

// 2026-10-14 is a Wednesday (ISO weekday 3).
const cfg = { ...DEFAULT_TAKEAWAY, enabled: true, windows: [{ weekdays: [3], from: "19:00", to: "20:00" }], slotMinutes: 15, leadMinutes: 20, maxOrdersPerSlot: 2 };

describe("pickupSlots", () => {
  it("lists slots in the window after the lead time", () => {
    expect(pickupSlots(cfg, { date: "2026-10-14", time: "18:00" }, {}).map((s) => s.time)).toEqual(["19:00", "19:15", "19:30", "19:45", "20:00"]);
    expect(pickupSlots(cfg, { date: "2026-10-14", time: "19:10" }, {}).map((s) => s.time)).toEqual(["19:30", "19:45", "20:00"]);
  });

  it("removes full slots and reports what is left", () => {
    const slots = pickupSlots(cfg, { date: "2026-10-14", time: "18:00" }, { "19:00": 2, "19:15": 1 });
    expect(slots[0]).toEqual({ time: "19:15", left: 1 });
  });

  it("returns nothing when disabled, closed or on another weekday", () => {
    expect(pickupSlots({ ...cfg, enabled: false }, { date: "2026-10-14", time: "18:00" }, {})).toEqual([]);
    expect(pickupSlots(cfg, { date: "2026-10-14", time: "18:00" }, {}, true)).toEqual([]);
    expect(pickupSlots(cfg, { date: "2026-10-15", time: "18:00" }, {})).toEqual([]);
  });
});

describe("takeaway helpers", () => {
  it("counts only active orders per slot", () => {
    expect(takenSlots([{ pickupTime: "19:00", status: "accepted" }, { pickupTime: "19:00", status: "rejected" }, { pickupTime: "19:00", status: "pending" }])).toEqual({ "19:00": 2 });
  });

  it("builds labels", () => {
    expect(takeawayLabel(7, "Mario Rossi Bianchi")).toBe("Asporto 7 · Mario Rossi");
    expect(placeLabel("Asporto 7 · Mario")).toBe("Asporto 7 · Mario");
    expect(placeLabel("12")).toBe("Tavolo 12");
  });

  it("allows only valid status transitions", () => {
    expect(canMoveTakeaway("pending", "accepted")).toBe(true);
    expect(canMoveTakeaway("pending", "ready")).toBe(false);
    expect(canMoveTakeaway("picked_up", "accepted")).toBe(false);
  });
});
