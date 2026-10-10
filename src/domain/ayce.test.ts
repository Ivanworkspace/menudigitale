import { describe, it, expect } from "vitest";
import { DEFAULT_AYCE, ayceSlot, checkAyceRound, ayceCoverTotal, secondsToNextRound, type AyceSession } from "./ayce";

const now = new Date("2026-10-09T20:00:00Z");
const session = (over: Partial<AyceSession> = {}): AyceSession => ({
  covers: 2, coversChildren: 0, openedAt: "2026-10-09T19:00:00Z", lastRoundAt: null, includedQtyByProduct: {}, ...over,
});

describe("ayce", () => {
  it("chooses the price slot", () => {
    expect(ayceSlot(DEFAULT_AYCE, { weekday: 5, time: "12:30", date: "2026-10-09" })).toBe("lunch");
    expect(ayceSlot(DEFAULT_AYCE, { weekday: 5, time: "20:30", date: "2026-10-09" })).toBe("dinner");
    expect(ayceSlot({ ...DEFAULT_AYCE, holidays: ["2026-12-25"] }, { weekday: 5, time: "12:30", date: "2026-12-25" })).toBe("holiday");
    expect(ayceSlot({ ...DEFAULT_AYCE, weekendAsHoliday: true }, { weekday: 7, time: "12:30", date: "2026-10-11" })).toBe("holiday");
  });
  it("limits pieces per round", () => {
    const ok = checkAyceRound(DEFAULT_AYCE, session(), [{ productId: "a", qty: 10, included: true, maxQty: null }], now);
    expect(ok).toEqual({ ok: true, includedPieces: 10 });
    const ko = checkAyceRound(DEFAULT_AYCE, session(), [{ productId: "a", qty: 11, included: true, maxQty: null }], now);
    expect(ko).toMatchObject({ ok: false, reason: "too_many_pieces" });
  });
  it("children count as persons for pieces", () => {
    expect(checkAyceRound(DEFAULT_AYCE, session({ covers: 1, coversChildren: 1 }), [{ productId: "a", qty: 10, included: true, maxQty: null }], now).ok).toBe(true);
  });
  it("extras are not limited", () => {
    expect(checkAyceRound(DEFAULT_AYCE, session({ lastRoundAt: now.toISOString() }), [{ productId: "beer", qty: 20, included: false, maxQty: null }], now).ok).toBe(true);
  });
  it("enforces the minimum interval with a countdown", () => {
    const s = session({ lastRoundAt: new Date(now.getTime() - 4 * 60_000).toISOString() });
    const r = checkAyceRound(DEFAULT_AYCE, s, [{ productId: "a", qty: 1, included: true, maxQty: null }], now);
    expect(r).toMatchObject({ ok: false, reason: "too_soon", waitSec: 360 });
    expect(secondsToNextRound(DEFAULT_AYCE, s.lastRoundAt, now)).toBe(360);
  });
  it("enforces per-product limits across rounds", () => {
    const s = session({ includedQtyByProduct: { sashimi: 3 } });
    const r = checkAyceRound(DEFAULT_AYCE, s, [{ productId: "sashimi", qty: 2, included: true, maxQty: 4 }], now);
    expect(r).toMatchObject({ ok: false, reason: "product_limit" });
  });
  it("enforces max stay", () => {
    const cfg = { ...DEFAULT_AYCE, maxStayMin: 30 };
    expect(checkAyceRound(cfg, session(), [{ productId: "a", qty: 1, included: true, maxQty: null }], now)).toMatchObject({ ok: false, reason: "stay_expired" });
  });
  it("requires covers", () => {
    expect(checkAyceRound(DEFAULT_AYCE, session({ covers: 0 }), [{ productId: "a", qty: 1, included: true, maxQty: null }], now)).toMatchObject({ ok: false, reason: "no_covers" });
  });
  it("computes cover total", () => {
    expect(ayceCoverTotal(DEFAULT_AYCE, "dinner", 2, 1)).toBe(2 * 2590 + 1490);
  });
});
