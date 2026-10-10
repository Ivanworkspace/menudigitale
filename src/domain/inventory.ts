/**
 * Inventory: recipes (bill of materials) and automatic stock consumption.
 */
export type Unit = "g" | "kg" | "ml" | "l" | "pz";

export type Ingredient = {
  id: string;
  name: string;
  unit: Unit;
  stock: number;
  minStock: number;
  costPerUnitCents: number | null;
  active: boolean;
};

export type RecipeLine = { ingredientId: string; qty: number };

export const UNIT_LABELS: Record<Unit, string> = { g: "g", kg: "kg", ml: "ml", l: "l", pz: "pz" };

/** Total consumption per ingredient for sold items. */
export function consumption(items: { productId: string; qty: number }[], recipes: Map<string, RecipeLine[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) {
    for (const r of recipes.get(i.productId) ?? []) {
      out.set(r.ingredientId, round3((out.get(r.ingredientId) ?? 0) + r.qty * i.qty));
    }
  }
  return out;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type StockLevel = "ok" | "low" | "out";
export function stockLevel(i: Pick<Ingredient, "stock" | "minStock">): StockLevel {
  if (i.stock <= 0) return "out";
  if (i.stock <= i.minStock) return "low";
  return "ok";
}

/** Products that can no longer be prepared because an ingredient ran out. */
export function productsToDisable(recipes: Map<string, RecipeLine[]>, outIngredientIds: Set<string>): string[] {
  return [...recipes.entries()].filter(([, lines]) => lines.some((l) => outIngredientIds.has(l.ingredientId))).map(([pid]) => pid);
}
