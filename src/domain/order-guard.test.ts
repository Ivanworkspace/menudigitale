import { describe, it, expect } from "vitest";
import { guardOrder, type GuardInput } from "./order-guard";
import { distanceMeters, isWithinRadius } from "./geo";

const VENUE = { lat: 45.4642, lng: 9.19, radiusM: 100 };
// ~55 m north of the venue
const NEAR = { status: "ok" as const, lat: 45.4647, lng: 9.19, accuracy: 20 };
// ~5.5 km away ("home")
const HOME = { status: "ok" as const, lat: 45.5142, lng: 9.19, accuracy: 15 };

const base = (over: Partial<GuardInput> = {}): GuardInput => ({
  protection: { requireOpenTable: true, autoOpenOnScan: false, geofence: "block", tableCode: false, manualFirstApproval: false, maxOrdersPerMinute: 3 },
  menuMode: "table_orders",
  session: { id: "s1", status: "open", accessCode: "4821", firstOrderApproved: false, ordersCount: 0 },
  guestSessionId: "s1",
  codeProvided: null,
  geo: NEAR,
  venue: VENUE,
  recentOrdersLastMinute: 0,
  ...over,
});

describe("geo", () => {
  it("computes distances", () => {
    expect(Math.round(distanceMeters(VENUE, NEAR))).toBeGreaterThan(50);
    expect(Math.round(distanceMeters(VENUE, NEAR))).toBeLessThan(60);
    expect(distanceMeters(VENUE, HOME)).toBeGreaterThan(5000);
  });
  it("caps accuracy credit", () => {
    expect(isWithinRadius(VENUE, 100, { ...HOME, accuracy: 100_000 }).inside).toBe(false);
    expect(isWithinRadius(VENUE, 30, { ...NEAR, accuracy: 40 }).inside).toBe(true);
  });
});

describe("guardOrder", () => {
  it("allows a normal order at the table", () => {
    expect(guardOrder(base())).toMatchObject({ ok: true, needsApproval: false });
  });
  it("blocks in static mode", () => {
    expect(guardOrder(base({ menuMode: "static" }))).toMatchObject({ ok: false, reason: "ordering_disabled" });
  });
  it("blocks when the table is not open", () => {
    expect(guardOrder(base({ session: null, guestSessionId: null }))).toMatchObject({ ok: false, reason: "table_closed" });
  });
  it("blocks an old QR photo after the bill was closed", () => {
    // Guest device still bound to s0, table now has a new session s1.
    expect(guardOrder(base({ guestSessionId: "s0" }))).toMatchObject({ ok: false, reason: "session_expired" });
    expect(guardOrder(base({ session: { id: "s1", status: "closed", accessCode: null, firstOrderApproved: true, ordersCount: 3 } }))).toMatchObject({
      ok: false,
      reason: "session_expired",
    });
  });
  it("blocks orders from home with geofence=block", () => {
    expect(guardOrder(base({ geo: HOME }))).toMatchObject({ ok: false, reason: "outside_area" });
    expect(guardOrder(base({ geo: { status: "denied" } }))).toMatchObject({ ok: false, reason: "geo_denied" });
  });
  it("asks the waiter with geofence=waiter_confirm", () => {
    const p = { ...base().protection, geofence: "waiter_confirm" as const };
    expect(guardOrder(base({ protection: p, geo: HOME }))).toMatchObject({ ok: true, needsApproval: true, approvalReason: "geo" });
    expect(guardOrder(base({ protection: p, geo: { status: "denied" } }))).toMatchObject({ ok: true, needsApproval: true });
  });
  it("skips geofence when off or venue has no coordinates", () => {
    expect(guardOrder(base({ protection: { ...base().protection, geofence: "off" }, geo: HOME }))).toMatchObject({ ok: true });
    expect(guardOrder(base({ venue: { lat: null, lng: null, radiusM: 100 }, geo: HOME }))).toMatchObject({ ok: true });
  });
  it("checks the table code", () => {
    const p = { ...base().protection, tableCode: true };
    expect(guardOrder(base({ protection: p, codeProvided: "0000" }))).toMatchObject({ ok: false, reason: "bad_code" });
    expect(guardOrder(base({ protection: p, codeProvided: "4821" }))).toMatchObject({ ok: true });
  });
  it("requires approval of the first order", () => {
    const p = { ...base().protection, manualFirstApproval: true };
    expect(guardOrder(base({ protection: p }))).toMatchObject({ ok: true, needsApproval: true, approvalReason: "first_order" });
    const s = { ...base().session!, firstOrderApproved: true };
    expect(guardOrder(base({ protection: p, session: s }))).toMatchObject({ ok: true, needsApproval: false });
  });
  it("rate limits", () => {
    expect(guardOrder(base({ recentOrdersLastMinute: 3 }))).toMatchObject({ ok: false, reason: "rate_limited" });
  });
});
