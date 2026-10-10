/**
 * Server-side order validation: prices always come from the menu data, never
 * from the client; hidden/unavailable products and invalid options are refused.
 */
import { describe, it, expect } from "vitest";
import { buildItems } from "@/server/orders/service";
import type { MenuData } from "@/server/menu/repo";

const data: MenuData = {
  menus: [{ id: "asporto", name: { it: "Asporto" }, kind: "takeaway", active: true, sort: 0, schedule: null }],
  categories: [
    { id: "pizze", name: { it: "Pizze" }, description: {}, parentId: null, icon: null, imagePath: null, sort: 0, active: true, visibility: null, menuIds: [] },
    { id: "vini", name: { it: "Vini" }, description: {}, parentId: null, icon: null, imagePath: null, sort: 1, active: true, visibility: null, menuIds: ["cena"] },
  ],
  products: [
    {
      id: "marg", categoryId: "pizze", name: { it: "Margherita" }, description: {}, priceCents: 700, prices: { asporto: 650 }, vatRateBp: 1000,
      departmentId: "pizzeria", allergens: [], tags: [], isFrozen: false, available: true, hidden: false, images: [], sort: 0,
      modifierGroupIds: ["extra"], ayceIncluded: true, ayceMaxQty: null, createdAt: "", updatedAt: "",
    },
    {
      id: "staff-only", categoryId: "pizze", name: { it: "Segreta" }, description: {}, priceCents: 900, prices: {}, vatRateBp: 1000,
      departmentId: null, allergens: [], tags: [], isFrozen: false, available: true, hidden: true, images: [], sort: 1,
      modifierGroupIds: [], ayceIncluded: false, ayceMaxQty: null, createdAt: "", updatedAt: "",
    },
    {
      id: "sold", categoryId: "pizze", name: { it: "Esaurita" }, description: {}, priceCents: 900, prices: {}, vatRateBp: 1000,
      departmentId: null, allergens: [], tags: [], isFrozen: false, available: false, hidden: false, images: [], sort: 2,
      modifierGroupIds: [], ayceIncluded: false, ayceMaxQty: null, createdAt: "", updatedAt: "",
    },
    {
      id: "chianti", categoryId: "vini", name: { it: "Chianti" }, description: {}, priceCents: 600, prices: {}, vatRateBp: 2200,
      departmentId: "bar", allergens: [12], tags: [], isFrozen: false, available: true, hidden: false, images: [], sort: 0,
      modifierGroupIds: [], ayceIncluded: false, ayceMaxQty: null, createdAt: "", updatedAt: "",
    },
  ],
  modifierGroups: [
    { id: "extra", name: { it: "Aggiunte" }, kind: "addon", minSelect: 0, maxSelect: 2, sort: 0, options: [{ id: "bufala", name: { it: "Bufala" }, priceDeltaCents: 250, available: true }] },
  ],
  departments: [],
};

const session = { menuId: null, currentCourse: 1, mode: "table_orders" as const };

describe("buildItems", () => {
  it("prices from the database, ignoring anything sent by the client", () => {
    const lines = [{ productId: "marg", qty: 2, modifiers: [{ groupId: "extra", optionIds: ["bufala"] }], unitPriceCents: 1 } as never];
    const [item] = buildItems(data, session, lines, { forStaff: false });
    expect(item.unitPriceCents).toBe(950);
    expect(item.vatRateBp).toBe(1000);
    expect(item.departmentId).toBe("pizzeria");
  });
  it("applies the session's price list", () => {
    const [item] = buildItems(data, { ...session, menuId: "asporto" }, [{ productId: "marg", qty: 1, modifiers: [] }], { forStaff: false });
    expect(item.unitPriceCents).toBe(650);
  });
  it("refuses unknown, sold-out, hidden or off-menu products for guests", () => {
    expect(() => buildItems(data, session, [{ productId: "nope", qty: 1, modifiers: [] }], { forStaff: false })).toThrow();
    expect(() => buildItems(data, session, [{ productId: "sold", qty: 1, modifiers: [] }], { forStaff: true })).toThrow(/esaurito/);
    expect(() => buildItems(data, session, [{ productId: "staff-only", qty: 1, modifiers: [] }], { forStaff: false })).toThrow();
    expect(() => buildItems(data, { ...session, menuId: "pranzo" }, [{ productId: "chianti", qty: 1, modifiers: [] }], { forStaff: false })).toThrow();
  });
  it("lets staff order hidden products", () => {
    expect(buildItems(data, session, [{ productId: "staff-only", qty: 1, modifiers: [] }], { forStaff: true })[0].unitPriceCents).toBe(900);
  });
  it("validates quantities and line count", () => {
    expect(() => buildItems(data, session, [{ productId: "marg", qty: 0, modifiers: [] }], { forStaff: false })).toThrow();
    expect(() => buildItems(data, session, [{ productId: "marg", qty: 51, modifiers: [] }], { forStaff: false })).toThrow();
    expect(() => buildItems(data, session, [{ productId: "marg", qty: 1.5 as number, modifiers: [] }], { forStaff: false })[0].qty).not.toThrow();
    expect(() => buildItems(data, session, [], { forStaff: false })).toThrow();
    expect(() => buildItems(data, session, Array(61).fill({ productId: "marg", qty: 1, modifiers: [] }), { forStaff: false })).toThrow();
  });
  it("holds later courses and flags AYCE-included items only in AYCE mode", () => {
    const items = buildItems(data, { ...session, mode: "ayce" }, [{ productId: "marg", qty: 1, modifiers: [], course: 2 }], { forStaff: true });
    expect(items[0].status).toBe("held");
    expect(items[0].ayceIncluded).toBe(true);
    expect(buildItems(data, session, [{ productId: "marg", qty: 1, modifiers: [] }], { forStaff: true })[0].ayceIncluded).toBe(false);
  });
  it("truncates notes", () => {
    const [i] = buildItems(data, session, [{ productId: "marg", qty: 1, modifiers: [], notes: "x".repeat(500) }], { forStaff: false });
    expect(i.notes.length).toBe(200);
  });
});
