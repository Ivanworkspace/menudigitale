import { describe, it, expect } from "vitest";
import { computeSubscription, shouldWarn } from "./subscription";

const now = new Date("2026-10-09T12:00:00Z");
const d = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe("computeSubscription", () => {
  it("active with future end", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(10), graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "active", status: "active", daysLeft: 10, accessAllowed: true });
  });

  it("trial uses trial end", () => {
    const s = computeSubscription({ status: "trial", trialEndsAt: d(3), subscriptionEndsAt: null, graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "trial", daysLeft: 3, accessAllowed: true });
  });

  it("enters grace after end", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(-2), graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "grace", status: "active", accessAllowed: true });
  });

  it("expires after grace", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(-8), graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "expired", status: "expired", accessAllowed: false });
  });

  it("manual suspension always blocks", () => {
    const s = computeSubscription({ status: "suspended", trialEndsAt: null, subscriptionEndsAt: d(100), graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "suspended", accessAllowed: false });
  });

  it("no end date never expires", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: null, graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "active", daysLeft: null, accessAllowed: true });
  });

  it("renewal reactivates an expired tenant", () => {
    const s = computeSubscription({ status: "expired", trialEndsAt: null, subscriptionEndsAt: d(30), graceDays: 7 }, now);
    expect(s).toMatchObject({ phase: "active", status: "active", accessAllowed: true });
  });

  it("zero grace expires immediately", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(-0.01), graceDays: 0 }, now);
    expect(s.phase).toBe("expired");
  });
});

describe("shouldWarn", () => {
  const warn = [14, 7, 3, 1];
  it("warns on configured days", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(7), graceDays: 7 }, now);
    expect(shouldWarn(s, warn)).toBe(true);
  });
  it("does not warn on other days", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(8), graceDays: 7 }, now);
    expect(shouldWarn(s, warn)).toBe(false);
  });
  it("warns daily during grace", () => {
    const s = computeSubscription({ status: "active", trialEndsAt: null, subscriptionEndsAt: d(-1), graceDays: 7 }, now);
    expect(shouldWarn(s, warn)).toBe(true);
  });
});
