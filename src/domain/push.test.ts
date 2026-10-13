import { describe, expect, it } from "vitest";
import { deltaLabel, shiftDay, topicsForType } from "./push";

describe("push topics", () => {
  it("maps notification types to topics", () => {
    expect(topicsForType("order_pending")).toEqual(["approvals"]);
    expect(topicsForType("stock_low")).toEqual(["stock"]);
    expect(topicsForType("message")).toEqual([]);
  });

  it("formats deltas", () => {
    expect(deltaLabel(112, 100)).toBe("+12%");
    expect(deltaLabel(95, 100)).toBe("−5%");
    expect(deltaLabel(10, 0)).toBeNull();
  });
});

describe("shiftDay", () => {
  it("crosses months and years", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-10-14", -7)).toBe("2026-10-07");
  });
});
