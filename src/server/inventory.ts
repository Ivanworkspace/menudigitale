import "server-only";
import { refs, db, nowIso, allWithId } from "@/server/db";
import { notify } from "@/server/notify";
import { menuChanged } from "@/server/menu/repo";
import { getTenant } from "@/server/tenancy/resolve";
import { consumption, productsToDisable, round3, stockLevel, type Ingredient, type RecipeLine } from "@/domain/inventory";
import type { Product } from "@/domain/menu";

/**
 * Applies stock movements for sold (sign = -1) or restocked (sign = +1)
 * items, based on product recipes. Runs only with the Inventory module and
 * never throws (stock problems must not block service).
 */
export async function applyRecipeConsumption(
  tenantId: string,
  items: { productId: string; qty: number }[],
  sign: -1 | 1,
  ref: { reason: "sale" | "cancel"; orderId: string; by?: string | null },
) {
  try {
    const tenant = await getTenant(tenantId);
    if (!tenant?.modules.inventory || !items.length) return;
    const products = await refs.products(tenantId).get().then(allWithId<Product>);
    const recipes = new Map<string, RecipeLine[]>(products.filter((p) => p.recipe?.length).map((p) => [p.id, p.recipe!]));
    const use = consumption(items, recipes);
    if (!use.size) return;

    const crossed: { ingredient: Ingredient; level: "low" | "out" }[] = [];
    await db().runTransaction(async (tx) => {
      crossed.length = 0;
      const snaps = await Promise.all([...use.keys()].map((id) => tx.get(refs.ingredients(tenantId).doc(id))));
      for (const s of snaps) {
        if (!s.exists) continue;
        const ing = { id: s.id, ...s.data() } as Ingredient;
        const delta = round3(sign * (use.get(s.id) ?? 0));
        const next = round3(ing.stock + delta);
        const before = stockLevel(ing);
        const after = stockLevel({ stock: next, minStock: ing.minStock });
        if (after !== before && after !== "ok") crossed.push({ ingredient: { ...ing, stock: next }, level: after });
        tx.update(s.ref, { stock: next });
        tx.create(refs.stockMovements(tenantId).doc(), {
          ingredientId: s.id,
          ingredientName: ing.name,
          delta,
          reason: ref.reason,
          orderId: ref.orderId,
          by: ref.by ?? null,
          at: nowIso(),
        });
      }
    });

    for (const c of crossed) {
      await notify(tenantId, {
        type: "stock_low",
        title: c.level === "out" ? `Esaurito: ${c.ingredient.name}` : `Scorta bassa: ${c.ingredient.name}`,
        body: `Rimanenza ${c.ingredient.stock} ${c.ingredient.unit}`,
        urgent: c.level === "out",
      });
    }
    // Automatically mark as sold out the products that need an exhausted ingredient.
    const out = new Set(crossed.filter((c) => c.level === "out").map((c) => c.ingredient.id));
    if (out.size) {
      const ids = productsToDisable(recipes, out);
      const batch = db().batch();
      for (const id of ids) batch.update(refs.products(tenantId).doc(id), { available: false, updatedAt: nowIso() });
      await batch.commit();
      for (const id of ids) {
        const p = products.find((x) => x.id === id);
        await notify(tenantId, { type: "product_sold_out", title: `Esaurito automaticamente: ${p?.name.it ?? ""}` });
      }
      await menuChanged(tenantId);
    }
  } catch (e) {
    console.error("inventory consumption failed", e);
  }
}
