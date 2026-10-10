import { describe, it, expect } from "vitest";
import { availableSlots, coversAt, DEFAULT_RESERVATIONS, weekdayOf } from "./reservations";
import { checkPromotion, earned, normalizePhone, DEFAULT_LOYALTY, type Promotion } from "./loyalty";
import { consumption, productsToDisable, stockLevel } from "./inventory";

describe("reservations", () => {
  const cfg = { ...DEFAULT_RESERVATIONS, maxCoversPerSlot: 10 };
  const now = { date: "2026-10-09", time: "10:00" }; // Friday
  it("weekday", () => {
    expect(weekdayOf("2026-10-09")).toBe(5);
    expect(weekdayOf("2026-10-12")).toBe(1);
  });
  it("lists slots with capacity and respects closed days", () => {
    const s = availableSlots(cfg, [], "2026-10-09", 2, now);
    expect(s[0]).toEqual({ time: "12:00", available: 10 });
    expect(s.map((x) => x.time)).toContain("22:00");
    expect(availableSlots(cfg, [], "2026-10-12", 2, now)).toEqual([]); // Monday closed
    expect(availableSlots(cfg, [], "2026-10-10", 2, now, ["2026-10-10"])).toEqual([]);
  });
  it("accounts for overlapping reservations", () => {
    const existing = [{ time: "19:00", durationMin: 90, covers: 8, status: "confirmed" as const }];
    expect(coversAt(existing, "20:00")).toBe(8);
    expect(coversAt(existing, "20:30")).toBe(0);
    const s = availableSlots(cfg, existing, "2026-10-09", 4, now);
    expect(s.find((x) => x.time === "19:30")).toBeUndefined();
    expect(s.find((x) => x.time === "20:30")?.available).toBe(10);
  });
  it("applies lead time, party size and horizon", () => {
    const s = availableSlots(cfg, [], "2026-10-09", 2, { date: "2026-10-09", time: "19:10" });
    expect(s[0].time).toBe("20:15");
    expect(availableSlots(cfg, [], "2026-10-09", 11, now)).toEqual([]);
    expect(availableSlots(cfg, [], "2027-10-09", 2, now)).toEqual([]);
    expect(availableSlots(cfg, [], "2026-10-08", 2, now)).toEqual([]);
  });
});

describe("loyalty & promotions", () => {
  it("earns points or stamps", () => {
    expect(earned(DEFAULT_LOYALTY, 3550)).toEqual({ points: 35, stamps: 0 });
    expect(earned({ ...DEFAULT_LOYALTY, mode: "stamps" }, 900)).toEqual({ points: 0, stamps: 0 });
    expect(earned({ ...DEFAULT_LOYALTY, mode: "stamps" }, 1500)).toEqual({ points: 0, stamps: 1 });
  });
  const promo: Promotion = {
    id: "p", name: "Happy hour", kind: "happy_hour", code: null, mode: "percent", value: 2000,
    schedule: { weekdays: [], from: "18:00", to: "20:00" }, validFrom: "2026-10-01", validTo: "2026-10-31",
    maxUses: 2, uses: 0, minSpendCents: 1000, active: true,
  };
  const ctx = { date: "2026-10-09", clock: { weekday: 5, time: "18:30" }, subtotalCents: 2000 };
  it("validates promotions", () => {
    expect(checkPromotion(promo, ctx)).toEqual({ ok: true });
    expect(checkPromotion(promo, { ...ctx, clock: { weekday: 5, time: "21:00" } }).ok).toBe(false);
    expect(checkPromotion(promo, { ...ctx, date: "2026-11-01" }).ok).toBe(false);
    expect(checkPromotion({ ...promo, uses: 2 }, ctx).ok).toBe(false);
    expect(checkPromotion(promo, { ...ctx, subtotalCents: 500 }).ok).toBe(false);
  });
  it("normalizes phones", () => {
    expect(normalizePhone("333 123 4567")).toBe("+393331234567");
    expect(normalizePhone("0041 79 123")).toBe("+4179123");
    expect(normalizePhone("+39 02 1234")).toBe("+39021234");
  });
});

describe("inventory", () => {
  const recipes = new Map([
    ["margherita", [{ ingredientId: "mozz", qty: 0.12 }, { ingredientId: "farina", qty: 0.25 }]],
    ["marinara", [{ ingredientId: "farina", qty: 0.25 }]],
  ]);
  it("computes consumption", () => {
    const c = consumption([{ productId: "margherita", qty: 2 }, { productId: "marinara", qty: 1 }, { productId: "acqua", qty: 3 }], recipes);
    expect(c.get("mozz")).toBe(0.24);
    expect(c.get("farina")).toBe(0.75);
    expect(c.size).toBe(2);
  });
  it("stock levels and products to disable", () => {
    expect(stockLevel({ stock: 0, minStock: 1 })).toBe("out");
    expect(stockLevel({ stock: 1, minStock: 1 })).toBe("low");
    expect(stockLevel({ stock: 5, minStock: 1 })).toBe("ok");
    expect(productsToDisable(recipes, new Set(["mozz"]))).toEqual(["margherita"]);
  });
});
