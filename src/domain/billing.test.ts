import { describe, it, expect } from "vitest";
import { computeBill, distribute, equalSplit, selectionAmount, cashChange, paidCents, type BillInput } from "./billing";

const line = (id: string, qty: number, price: number, vat = 1000) => ({ id, name: id, qty, unitPriceCents: price, vatRateBp: vat });

const base = (over: Partial<BillInput> = {}): BillInput => ({
  lines: [line("pizza", 2, 800), line("acqua", 1, 250, 2200)],
  covers: 2,
  coverChargeCents: 200,
  servicePctBp: 0,
  adjustments: [],
  ...over,
});

describe("computeBill", () => {
  it("sums items and cover", () => {
    const t = computeBill(base());
    expect(t).toMatchObject({ itemsCents: 1850, coverCents: 400, serviceCents: 0, totalCents: 2250 });
  });

  it("breaks down VAT per rate (prices VAT-inclusive)", () => {
    const t = computeBill(base());
    const r10 = t.vat.find((v) => v.rateBp === 1000)!;
    const r22 = t.vat.find((v) => v.rateBp === 2200)!;
    expect(r10.grossCents).toBe(1600 + 400);
    expect(r10.netCents).toBe(1818);
    expect(r10.vatCents).toBe(182);
    expect(r22).toEqual({ rateBp: 2200, grossCents: 250, netCents: 205, vatCents: 45 });
    expect(t.vat.reduce((s, v) => s + v.grossCents, 0)).toBe(t.totalCents);
  });

  it("applies service on items only", () => {
    const t = computeBill(base({ servicePctBp: 1000 }));
    expect(t.serviceCents).toBe(185);
    expect(t.totalCents).toBe(2250 + 185);
  });

  it("applies percent and amount discounts and surcharges", () => {
    const t = computeBill(
      base({
        adjustments: [
          { id: "a", kind: "discount", mode: "percent", value: 1000, reason: "amici" },
          { id: "b", kind: "surcharge", mode: "amount", value: 100, reason: "asporto" },
        ],
      }),
    );
    expect(t.adjustmentsCents).toBe(-225 + 100);
    expect(t.totalCents).toBe(2250 - 125);
    expect(t.vat.reduce((s, v) => s + v.grossCents, 0)).toBe(t.totalCents);
  });

  it("never goes below zero", () => {
    const t = computeBill(base({ adjustments: [{ id: "x", kind: "discount", mode: "amount", value: 999_999, reason: "omaggio" }] }));
    expect(t.totalCents).toBe(0);
    expect(t.vat.every((v) => v.grossCents === 0)).toBe(true);
  });

  it("AYCE: per-person price replaces the cover charge", () => {
    const t = computeBill(
      base({
        lines: [line("birra", 2, 400, 2200), line("sushi", 10, 0)],
        ayce: { adults: 2, children: 1, adultCents: 2590, childCents: 1490, vatRateBp: 1000 },
      }),
    );
    expect(t.coverCents).toBe(0);
    expect(t.ayceCents).toBe(2 * 2590 + 1490);
    expect(t.totalCents).toBe(6670 + 800);
  });

  it("handles an empty bill", () => {
    expect(computeBill(base({ lines: [], covers: 0 })).totalCents).toBe(0);
  });
});

describe("splits", () => {
  it("equal split adds up exactly", () => {
    expect(equalSplit(1000, 3)).toEqual([334, 333, 333]);
    expect(equalSplit(2250, 4).reduce((a, b) => a + b, 0)).toBe(2250);
    expect(equalSplit(5, 0)).toEqual([5]);
  });
  it("distribute is exact with negatives", () => {
    const r = distribute(-125, [2000, 250]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(-125);
    expect(r).toEqual([-111, -14]);
    expect(distribute(7, [0, 0])).toEqual([4, 3]);
  });
  it("selection amount includes proportional service and discount", () => {
    const b = base({ servicePctBp: 1000, adjustments: [{ id: "d", kind: "discount", mode: "percent", value: 1000, reason: "" }] });
    const t = computeBill(b);
    const pizzaOnly = selectionAmount(b, t, { pizza: 1 }, { persons: 1, totalPersons: 2 });
    const rest = selectionAmount(b, t, { pizza: 1, acqua: 1 }, { persons: 1, totalPersons: 2 });
    // The two parts add up to the total (±1 cent rounding).
    expect(Math.abs(pizzaOnly + rest - t.totalCents)).toBeLessThanOrEqual(1);
  });
  it("ignores quantities above what was ordered", () => {
    const b = base();
    const t = computeBill(b);
    expect(selectionAmount(b, t, { pizza: 99 })).toBe(selectionAmount(b, t, { pizza: 2 }));
  });
});

describe("payments", () => {
  it("computes change", () => {
    expect(cashChange(2250, 5000)).toEqual({ appliedCents: 2250, changeCents: 2750 });
    expect(cashChange(2250, 2000)).toEqual({ appliedCents: 2000, changeCents: 0 });
  });
  it("sums payments", () => {
    expect(paidCents([{ amountCents: 1000 }, { amountCents: 1250 }])).toBe(2250);
  });
});
