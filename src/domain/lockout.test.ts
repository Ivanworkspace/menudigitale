import { describe, it, expect } from "vitest";
import { evaluateLockout, PIN_LOCKOUT } from "./lockout";

const now = new Date("2026-10-09T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const fail = (min: number) => ({ success: false, createdAt: ago(min) });
const ok = (min: number) => ({ success: true, createdAt: ago(min) });

describe("evaluateLockout", () => {
  it("allows with no attempts", () => {
    expect(evaluateLockout([], PIN_LOCKOUT, now)).toEqual({ locked: false, until: null, remaining: 5 });
  });

  it("counts down remaining attempts", () => {
    expect(evaluateLockout([fail(1), fail(2)], PIN_LOCKOUT, now).remaining).toBe(3);
  });

  it("locks after 5 failures within the window", () => {
    const s = evaluateLockout([fail(0), fail(1), fail(2), fail(3), fail(4)], PIN_LOCKOUT, now);
    expect(s.locked).toBe(true);
    expect(s.until).toEqual(new Date(now.getTime() + 15 * 60_000));
  });

  it("unlocks after the lock period", () => {
    const s = evaluateLockout([fail(16), fail(17), fail(18), fail(19), fail(20)], PIN_LOCKOUT, now);
    expect(s.locked).toBe(false);
  });

  it("a success resets the counter", () => {
    const s = evaluateLockout([fail(0), fail(1), ok(2), fail(3), fail(4), fail(5), fail(6)], PIN_LOCKOUT, now);
    expect(s.locked).toBe(false);
    expect(s.remaining).toBe(3);
  });

  it("failures spread over more than the window do not lock", () => {
    const s = evaluateLockout([fail(0), fail(5), fail(10), fail(14), fail(29)], PIN_LOCKOUT, now);
    expect(s.locked).toBe(false);
  });
});
