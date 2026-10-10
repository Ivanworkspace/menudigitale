import { describe, it, expect } from "vitest";
import { parseEuroToCents, formatEuro } from "./format";

describe("money", () => {
  it("parses italian inputs", () => {
    expect(parseEuroToCents("12,50")).toBe(1250);
    expect(parseEuroToCents("12.5")).toBe(1250);
    expect(parseEuroToCents("1.234,56")).toBe(123456);
    expect(parseEuroToCents("€ 9")).toBe(900);
    expect(parseEuroToCents("0,1")).toBe(10);
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("-3")).toBeNull();
  });
  it("formats", () => {
    expect(formatEuro(1250).replace(/\s/g, " ")).toBe("12,50 €");
  });
});

import { romeEndOfDay } from "./format";
describe("romeEndOfDay", () => {
  it("handles summer and winter time", () => {
    expect(romeEndOfDay("2026-07-01").toISOString()).toBe("2026-07-01T21:59:59.000Z");
    expect(romeEndOfDay("2026-12-01").toISOString()).toBe("2026-12-01T22:59:59.000Z");
  });
});
