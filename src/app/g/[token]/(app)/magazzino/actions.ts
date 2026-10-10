"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, db, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { notify } from "@/server/notify";
import { round3, stockLevel } from "@/domain/inventory";

const INV = { permission: "inventory.manage" as const, module: "inventory" as const };

const ingSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  unit: z.enum(["g", "kg", "ml", "l", "pz"]),
  minStock: z.number().min(0).max(1_000_000),
  costPerUnitCents: z.number().int().min(0).nullable(),
  active: z.boolean(),
});

export async function saveIngredient(token: string, v: unknown) {
  return staffAction(token, INV, async (ctx) => {
    const r = ingSchema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    const { id, ...data } = r.data;
    const col = refs.ingredients(ctx.tenant.id);
    if (id) await col.doc(id).update(data);
    else await col.add({ ...data, stock: 0, createdAt: nowIso() });
    revalidatePath(`${ctx.basePath}/magazzino`, "layout");
  });
}

/**
 * Stock movement: load (carico), waste/unload (scarico) or inventory count
 * (sets the actual quantity and records the difference).
 */
export async function moveStock(token: string, ingredientId: string, kind: "load" | "waste" | "inventory", qty: number, note: string) {
  return staffAction(token, INV, async (ctx) => {
    if (!Number.isFinite(qty) || qty < 0 || (kind !== "inventory" && qty === 0)) throw new UserError("Quantità non valida.");
    let crossed: { name: string; level: string; stock: number; unit: string } | null = null;
    await db().runTransaction(async (tx) => {
      const ref = refs.ingredients(ctx.tenant.id).doc(ingredientId);
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError("Ingrediente non trovato.");
      const stock = s.get("stock") as number;
      const minStock = s.get("minStock") as number;
      const next = round3(kind === "load" ? stock + qty : kind === "waste" ? stock - qty : qty);
      const delta = round3(next - stock);
      const after = stockLevel({ stock: next, minStock });
      if (after !== "ok" && stockLevel({ stock, minStock }) !== after) crossed = { name: s.get("name"), level: after, stock: next, unit: s.get("unit") };
      tx.update(ref, { stock: next });
      tx.create(refs.stockMovements(ctx.tenant.id).doc(), {
        ingredientId, ingredientName: s.get("name"), delta, reason: kind, note: note.slice(0, 120) || null, orderId: null, by: ctx.staff.displayName, at: nowIso(),
      });
    });
    const c = crossed as { name: string; level: string; stock: number; unit: string } | null;
    if (c) await notify(ctx.tenant.id, { type: "stock_low", title: `${c.level === "out" ? "Esaurito" : "Scorta bassa"}: ${c.name}`, body: `Rimanenza ${c.stock} ${c.unit}` });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), `stock.${kind}`, { entity: "ingredient", entityId: ingredientId, diff: { qty, note } });
    revalidatePath(`${ctx.basePath}/magazzino`, "layout");
  });
}

export async function saveRecipe(token: string, productId: string, lines: { ingredientId: string; qty: number }[]) {
  return staffAction(token, INV, async (ctx) => {
    const clean = lines.filter((l) => l.ingredientId && Number.isFinite(l.qty) && l.qty > 0).map((l) => ({ ingredientId: l.ingredientId, qty: round3(l.qty) }));
    if (clean.length > 40) throw new UserError("Troppi ingredienti.");
    const ref = refs.products(ctx.tenant.id).doc(productId);
    if (!(await ref.get()).exists) throw new UserError("Prodotto non trovato.");
    await ref.update({ recipe: clean, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "product.recipe_updated", { entity: "product", entityId: productId });
    revalidatePath(`${ctx.basePath}/magazzino/ricette`);
  });
}
