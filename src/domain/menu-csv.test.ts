import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { parseProductsCsv, exportProductsCsv } from "./menu-csv";
import type { Product } from "./menu";

describe("csv", () => {
  it("parses quotes, delimiters and BOM", () => {
    const rows = parseCsv('﻿a;b;c\r\n"x;y";"he said ""hi""";\n1;2;3\n');
    expect(rows).toEqual([["a", "b", "c"], ["x;y", 'he said "hi"', ""], ["1", "2", "3"]]);
  });
  it("auto-detects comma", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("escapes formulas on export", () => {
    expect(toCsv([["=SUM(A1)", "-5", "ok"]])).toContain("'=SUM(A1)");
    expect(toCsv([["-5"]])).toContain("-5");
  });
});

describe("products csv", () => {
  const csv = [
    "id;categoria;nome_it;descrizione_it;nome_en;prezzo;iva;reparto;allergeni;tag;surgelato;disponibile",
    ";Pizze;Margherita;Pomodoro e mozzarella;Margherita pizza;7,50;10;Pizzeria;1|7;vegetarian;no;sì",
    ";Bevande;Acqua;;Water;2;22;Bar;;;;",
  ].join("\n");

  it("parses rows", () => {
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      category: "Pizze", priceCents: 750, vatRateBp: 1000, allergens: [1, 7], tags: ["vegetarian"],
      name: { it: "Margherita", en: "Margherita pizza" }, isFrozen: false, available: true, department: "Pizzeria",
    });
    expect(rows[1]).toMatchObject({ priceCents: 200, vatRateBp: 2200, available: true });
  });

  it("reports errors with line numbers", () => {
    const bad = "categoria;nome_it;prezzo;iva;allergeni\nPizze;X;abc;10;\nPizze;Y;5;7;\nPizze;Z;5;10;15";
    const { errors } = parseProductsCsv(bad);
    expect(errors).toEqual(["Riga 2: prezzo non valido", "Riga 3: IVA non valida", "Riga 4: allergeni non validi (1–14)"]);
  });

  it("round-trips export -> import", () => {
    const p = {
      id: "abc", categoryId: "c1", name: { it: "Tiramisù", en: "Tiramisu" }, description: { it: "Classico; fatto in casa" },
      priceCents: 550, prices: {}, vatRateBp: 1000, departmentId: null, allergens: [1, 3, 7], tags: ["new"], isFrozen: true,
      available: false, hidden: false, images: [], sort: 0, modifierGroupIds: [], ayceIncluded: false, ayceMaxQty: null,
      createdAt: "", updatedAt: "",
    } as Product;
    const out = exportProductsCsv([p], () => "Dolci", () => "", ["it", "en"]);
    const { rows, errors } = parseProductsCsv(out);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      id: "abc", category: "Dolci", priceCents: 550, allergens: [1, 3, 7], tags: ["new"], isFrozen: true, available: false,
      description: { it: "Classico; fatto in casa" }, name: { it: "Tiramisù", en: "Tiramisu" },
    });
  });
});
