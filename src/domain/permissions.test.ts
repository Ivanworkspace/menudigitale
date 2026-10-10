import { describe, it, expect } from "vitest";
import { resolvePermissions, visibleNav } from "./permissions";
import { toModuleFlags } from "./modules";

describe("permissions", () => {
  it("owner has everything and ignores overrides", () => {
    const p = resolvePermissions("owner", [{ role: "owner", permission: "menu.edit", allowed: false }]);
    expect(p.has("menu.edit")).toBe(true);
  });
  it("overrides add and remove", () => {
    const p = resolvePermissions("waiter", [
      { role: "waiter", permission: "discounts.apply", allowed: true },
      { role: "waiter", permission: "orders.approve", allowed: false },
      { role: "kitchen", permission: "revenue.view", allowed: true },
      { role: "waiter", permission: "bogus", allowed: true },
    ]);
    expect(p.has("discounts.apply")).toBe(true);
    expect(p.has("orders.approve")).toBe(false);
    expect(p.has("revenue.view")).toBe(false);
  });
  it("nav hides disabled modules", () => {
    const perms = resolvePermissions("owner");
    const nav = visibleNav(perms, toModuleFlags([{ module: "orders", enabled: true }]));
    const hrefs = nav.map((n) => n.href);
    expect(hrefs).toContain("ordini");
    expect(hrefs).not.toContain("cucina");
    expect(hrefs).toContain("menu");
  });
});
