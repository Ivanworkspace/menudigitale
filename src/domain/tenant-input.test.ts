import { describe, it, expect } from "vitest";
import { isValidPartitaIva, createTenantSchema } from "./tenant-input";

describe("partita iva", () => {
  it("validates checksum", () => {
    expect(isValidPartitaIva("00743110157")).toBe(true);
    expect(isValidPartitaIva("00743110158")).toBe(false);
    expect(isValidPartitaIva("123")).toBe(false);
  });
});

describe("createTenantSchema", () => {
  const base = {
    legalName: "Da Mario srl", displayName: "Pizzeria Da Mario", vatNumber: "IT 00743110157",
    email: "", slug: "pizzeria-da-mario", planId: null, status: "trial", modules: ["orders"],
    defaultMenuMode: "table_orders", lat: 45.46, lng: 9.19,
    branding: { primaryColor: "#b91c1c", accentColor: "#f59e0b", backgroundColor: "#fffaf5", fontFamily: "Inter" },
  };
  it("normalizes", () => {
    const r = createTenantSchema.parse(base);
    expect(r.vatNumber).toBe("00743110157");
    expect(r.email).toBeNull();
    expect(r.geofenceRadiusM).toBe(100);
  });
  it("rejects reserved slug and bad module", () => {
    expect(createTenantSchema.safeParse({ ...base, slug: "admin" }).success).toBe(false);
    expect(createTenantSchema.safeParse({ ...base, modules: ["nope"] }).success).toBe(false);
  });
});
