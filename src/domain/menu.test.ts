import { describe, it, expect } from "vitest";
import {
  tr,
  localClock,
  isVisibleAt,
  currentMenu,
  priceLine,
  productPrice,
  filterByAllergens,
  SelectionError,
  type ModifierGroup,
  type Menu,
} from "./menu";

describe("tr", () => {
  it("falls back to italian", () => {
    expect(tr({ it: "Pizza", en: "" }, "en")).toBe("Pizza");
    expect(tr({ it: "Pizza", en: "Pizza EN" }, "en")).toBe("Pizza EN");
    expect(tr({ en: "Only EN" }, "de")).toBe("Only EN");
    expect(tr(null, "it")).toBe("");
  });
});

describe("visibility", () => {
  it("computes Rome local clock", () => {
    // 2026-10-09 is a Friday; 08:30Z = 10:30 Rome (CEST)
    expect(localClock(new Date("2026-10-09T08:30:00Z"))).toEqual({ weekday: 5, time: "10:30" });
    // Winter: 2026-12-07 Monday 23:15Z = Tuesday 00:15 Rome
    expect(localClock(new Date("2026-12-07T23:15:00Z"))).toEqual({ weekday: 2, time: "00:15" });
  });
  it("breakfast only until 11", () => {
    const v = { weekdays: [], from: "06:00", to: "11:00" };
    expect(isVisibleAt(v, { weekday: 1, time: "10:59" })).toBe(true);
    expect(isVisibleAt(v, { weekday: 1, time: "11:00" })).toBe(false);
  });
  it("weekday filter", () => {
    const v = { weekdays: [6, 7], from: null, to: null };
    expect(isVisibleAt(v, { weekday: 6, time: "12:00" })).toBe(true);
    expect(isVisibleAt(v, { weekday: 1, time: "12:00" })).toBe(false);
  });
  it("overnight windows belong to the starting day", () => {
    const v = { weekdays: [5], from: "22:00", to: "02:00" }; // Friday night
    expect(isVisibleAt(v, { weekday: 5, time: "23:00" })).toBe(true);
    expect(isVisibleAt(v, { weekday: 6, time: "01:30" })).toBe(true);
    expect(isVisibleAt(v, { weekday: 6, time: "23:00" })).toBe(false);
    expect(isVisibleAt(v, { weekday: 5, time: "01:30" })).toBe(false);
  });
  it("picks the scheduled menu", () => {
    const menus: Menu[] = [
      { id: "lunch", name: { it: "Pranzo" }, kind: "dine_in", active: true, sort: 1, schedule: { weekdays: [], from: "11:00", to: "16:00" } },
      { id: "dinner", name: { it: "Cena" }, kind: "dine_in", active: true, sort: 2, schedule: { weekdays: [], from: "18:00", to: "23:59" } },
      { id: "takeaway", name: { it: "Asporto" }, kind: "takeaway", active: true, sort: 3, schedule: null },
    ];
    expect(currentMenu(menus, { weekday: 1, time: "12:00" })?.id).toBe("lunch");
    expect(currentMenu(menus, { weekday: 1, time: "20:00" })?.id).toBe("dinner");
    expect(currentMenu(menus, { weekday: 1, time: "17:00" })?.id).toBe("lunch"); // first active
  });
});

describe("pricing", () => {
  const groups: ModifierGroup[] = [
    {
      id: "size", name: { it: "Formato" }, kind: "variant", minSelect: 1, maxSelect: 1, sort: 0,
      options: [
        { id: "s", name: { it: "Normale" }, priceDeltaCents: 0, available: true },
        { id: "l", name: { it: "Maxi" }, priceDeltaCents: 300, available: true },
      ],
    },
    {
      id: "extra", name: { it: "Aggiunte" }, kind: "addon", minSelect: 0, maxSelect: 2, sort: 1,
      options: [
        { id: "bufala", name: { it: "Bufala" }, priceDeltaCents: 200, available: true },
        { id: "nduja", name: { it: "Nduja" }, priceDeltaCents: 150, available: true },
        { id: "tartufo", name: { it: "Tartufo" }, priceDeltaCents: 500, available: false },
      ],
    },
  ];
  const pizza = { priceCents: 800, prices: { asporto: 700 }, modifierGroupIds: ["size", "extra"] };

  it("uses price list override", () => {
    expect(productPrice(pizza, "asporto")).toBe(700);
    expect(productPrice(pizza, "cena")).toBe(800);
  });
  it("adds modifiers", () => {
    const r = priceLine(pizza, groups, [{ groupId: "size", optionIds: ["l"] }, { groupId: "extra", optionIds: ["bufala", "nduja"] }], null);
    expect(r.unitPriceCents).toBe(800 + 300 + 200 + 150);
    expect(r.modifiers).toHaveLength(3);
  });
  it("enforces required variants", () => {
    expect(() => priceLine(pizza, groups, [], null)).toThrow(SelectionError);
  });
  it("enforces max and availability", () => {
    expect(() =>
      priceLine(pizza, groups, [{ groupId: "size", optionIds: ["s"] }, { groupId: "extra", optionIds: ["bufala", "nduja", "tartufo"] }], null),
    ).toThrow(SelectionError);
    expect(() => priceLine(pizza, groups, [{ groupId: "size", optionIds: ["s"] }, { groupId: "extra", optionIds: ["tartufo"] }], null)).toThrow(
      /non disponibile/,
    );
  });
  it("rejects groups not attached to the product and unknown options", () => {
    expect(() => priceLine(pizza, groups, [{ groupId: "size", optionIds: ["s"] }, { groupId: "other", optionIds: ["x"] }], null)).toThrow();
    expect(() => priceLine(pizza, groups, [{ groupId: "size", optionIds: ["zz"] }], null)).toThrow();
  });
  it("ignores duplicate option ids (no double charge)", () => {
    const r = priceLine(pizza, groups, [{ groupId: "size", optionIds: ["l", "l"] }], null);
    expect(r.unitPriceCents).toBe(1100);
  });
});

describe("allergen filter", () => {
  it("excludes products with selected allergens", () => {
    const items = [{ id: 1, allergens: [1, 7] }, { id: 2, allergens: [4] }, { id: 3, allergens: [] }];
    expect(filterByAllergens(items, [7]).map((i) => i.id)).toEqual([2, 3]);
    expect(filterByAllergens(items, []).length).toBe(3);
  });
});
