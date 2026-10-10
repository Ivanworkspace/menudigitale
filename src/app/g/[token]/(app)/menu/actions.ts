"use server";

import { revalidatePath } from "next/cache";
import { refs, db, nowIso, withId } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { menuChanged } from "@/server/menu/repo";
import { storeTenantImage, removeTenantImage } from "@/server/images";
import { translateTexts } from "@/server/translate";
import { categorySchema, menuSchema, modifierGroupSchema, productSchema } from "@/domain/menu-input";
import { parseProductsCsv } from "@/domain/menu-csv";
import { slugify } from "@/domain/slug";
import type { Product } from "@/domain/menu";
import type { StaffContext } from "@/server/auth/staff-session";

const EDIT = { permission: "menu.edit" as const };

function invalid(err: { issues: { message: string }[] }): never {
  throw new UserError(err.issues[0]?.message ?? "Dati non validi.");
}

async function done(ctx: StaffContext) {
  await menuChanged(ctx.tenant.id);
  revalidatePath(`${ctx.basePath}/menu`, "layout");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategory(token: string, values: unknown) {
  return staffAction(token, EDIT, async (ctx) => {
    const parsed = categorySchema.safeParse(values);
    if (!parsed.success) invalid(parsed.error);
    const { id, ...data } = parsed.data;
    const col = refs.categories(ctx.tenant.id);
    if (data.parentId && (data.parentId === id || !(await col.doc(data.parentId).get()).exists)) {
      throw new UserError("Categoria principale non valida.");
    }
    if (id) {
      await col.doc(id).update({ ...data, updatedAt: nowIso() });
    } else {
      const count = (await col.count().get()).data().count;
      await col.add({ ...data, imagePath: null, sort: count, createdAt: nowIso(), updatedAt: nowIso() });
    }
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "category.updated" : "category.created", {
      entity: "category", entityId: id, diff: { name: data.name.it },
    });
    await done(ctx);
  });
}

export async function deleteCategory(token: string, categoryId: string) {
  return staffAction(token, EDIT, async (ctx) => {
    const [products, children] = await Promise.all([
      refs.products(ctx.tenant.id).where("categoryId", "==", categoryId).limit(1).get(),
      refs.categories(ctx.tenant.id).where("parentId", "==", categoryId).limit(1).get(),
    ]);
    if (!products.empty || !children.empty) throw new UserError("Svuota la categoria (prodotti e sottocategorie) prima di eliminarla.");
    await refs.categories(ctx.tenant.id).doc(categoryId).delete();
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "category.deleted", { entity: "category", entityId: categoryId });
    await done(ctx);
  });
}

/** Persists a new order (drag & drop) for categories or products. */
export async function reorder(token: string, kind: "categories" | "products" | "modifier_groups" | "menus", ids: string[]) {
  return staffAction(token, EDIT, async (ctx) => {
    if (ids.length > 500) throw new UserError("Troppi elementi.");
    const col =
      kind === "categories" ? refs.categories(ctx.tenant.id)
      : kind === "products" ? refs.products(ctx.tenant.id)
      : kind === "menus" ? refs.menus(ctx.tenant.id)
      : refs.modifierGroups(ctx.tenant.id);
    const batch = db().batch();
    ids.forEach((id, i) => batch.update(col.doc(id), { sort: i }));
    await batch.commit();
    await done(ctx);
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

async function assertProductLimit(ctx: StaffContext) {
  if (!ctx.tenant.planId) return;
  const plan = (await refs.plans().doc(ctx.tenant.planId).get()).data();
  const max = plan?.maxProducts as number | null | undefined;
  if (max == null) return;
  const count = (await refs.products(ctx.tenant.id).count().get()).data().count;
  if (count >= max) throw new UserError(`Il tuo piano consente al massimo ${max} prodotti.`);
}

/**
 * Creates/updates a product. FormData: "payload" (JSON) + "newImages" files.
 * `payload.images` lists the existing image paths to keep, in order.
 */
export async function saveProduct(token: string, formData: FormData) {
  return staffAction(token, EDIT, async (ctx) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("payload")));
    } catch {
      throw new UserError("Dati non validi.");
    }
    const parsed = productSchema.safeParse(raw);
    if (!parsed.success) invalid(parsed.error);
    const { id, ...data } = parsed.data;
    const t = ctx.tenant.id;
    const col = refs.products(t);

    if (!(await refs.categories(t).doc(data.categoryId).get()).exists) throw new UserError("Categoria non trovata.");
    if (data.departmentId && !(await refs.departments(t).doc(data.departmentId).get()).exists) {
      throw new UserError("Reparto non trovato.");
    }
    const before = id ? withId<Product>(await col.doc(id).get()) : null;
    if (id && !before) throw new UserError("Prodotto non trovato.");
    if (!id) await assertProductLimit(ctx);

    // Only keep images that belonged to this product (no foreign paths).
    const keep = data.images.filter((p) => before?.images.includes(p));
    const uploads = formData.getAll("newImages").filter((f): f is File => f instanceof File && f.size > 0);
    if (keep.length + uploads.length > 6) throw new UserError("Massimo 6 foto per prodotto.");
    const added: string[] = [];
    for (const file of uploads) {
      added.push(await storeTenantImage(t, "products", file, { maxWidth: 1400, thumbWidth: 480 }));
    }
    const images = [...keep, ...added];
    for (const old of before?.images ?? []) if (!images.includes(old)) await removeTenantImage(old, true);

    const doc = { ...data, images, updatedAt: nowIso() };
    let productId = id;
    if (id) await col.doc(id).update(doc);
    else {
      const count = (await col.where("categoryId", "==", data.categoryId).count().get()).data().count;
      productId = (await col.add({ ...doc, sort: count, createdAt: nowIso() })).id;
    }

    const priceChanged = before && (before.priceCents !== data.priceCents || JSON.stringify(before.prices) !== JSON.stringify(data.prices));
    await logTenantAction(t, staffActor(ctx), id ? (priceChanged ? "product.price_changed" : "product.updated") : "product.created", {
      entity: "product",
      entityId: productId,
      diff: priceChanged
        ? { name: data.name.it, from: { price: before!.priceCents, prices: before!.prices }, to: { price: data.priceCents, prices: data.prices } }
        : { name: data.name.it },
    });
    await done(ctx);
    return { id: productId! };
  });
}

export async function deleteProduct(token: string, productId: string) {
  return staffAction(token, EDIT, async (ctx) => {
    const ref = refs.products(ctx.tenant.id).doc(productId);
    const p = withId<Product>(await ref.get());
    if (!p) throw new UserError("Prodotto non trovato.");
    await ref.delete();
    for (const img of p.images) await removeTenantImage(img, true);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "product.deleted", { entity: "product", entityId: productId, diff: { name: p.name.it } });
    await done(ctx);
  });
}

export async function duplicateProduct(token: string, productId: string) {
  return staffAction(token, EDIT, async (ctx) => {
    await assertProductLimit(ctx);
    const p = withId<Product>(await refs.products(ctx.tenant.id).doc(productId).get());
    if (!p) throw new UserError("Prodotto non trovato.");
    const { id: _id, ...rest } = p;
    void _id;
    const copy = {
      ...rest,
      name: Object.fromEntries(Object.entries(p.name).map(([k, v]) => [k, `${v} (copia)`])),
      images: [], // photos are not shared between products
      sort: p.sort + 0.5,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const ref = await refs.products(ctx.tenant.id).add(copy);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "product.duplicated", { entity: "product", entityId: ref.id });
    await done(ctx);
    return { id: ref.id };
  });
}

/** One-tap available / sold out. Allowed to waiters and kitchen too. */
export async function setProductAvailability(token: string, productId: string, available: boolean) {
  return staffAction(token, { permission: "products.availability" }, async (ctx) => {
    const ref = refs.products(ctx.tenant.id).doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new UserError("Prodotto non trovato.");
    await ref.update({ available, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), available ? "product.available" : "product.sold_out", {
      entity: "product", entityId: productId, diff: { name: snap.get("name.it") },
    });
    await done(ctx);
  });
}

// ---------------------------------------------------------------------------
// Modifier groups (variants, add-ons, removals)
// ---------------------------------------------------------------------------

export async function saveModifierGroup(token: string, values: unknown) {
  return staffAction(token, EDIT, async (ctx) => {
    const parsed = modifierGroupSchema.safeParse(values);
    if (!parsed.success) invalid(parsed.error);
    const { id, ...data } = parsed.data;
    const col = refs.modifierGroups(ctx.tenant.id);
    if (new Set(data.options.map((o) => o.id)).size !== data.options.length) throw new UserError("Opzioni duplicate.");
    if (id) await col.doc(id).update({ ...data, updatedAt: nowIso() });
    else await col.add({ ...data, sort: (await col.count().get()).data().count, createdAt: nowIso(), updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "modifier_group.updated" : "modifier_group.created", {
      entity: "modifier_group", entityId: id, diff: { name: data.name.it },
    });
    await done(ctx);
  });
}

export async function deleteModifierGroup(token: string, groupId: string) {
  return staffAction(token, EDIT, async (ctx) => {
    const used = await refs.products(ctx.tenant.id).where("modifierGroupIds", "array-contains", groupId).limit(1).get();
    if (!used.empty) throw new UserError("Il gruppo è usato da almeno un prodotto: rimuovilo prima dai prodotti.");
    await refs.modifierGroups(ctx.tenant.id).doc(groupId).delete();
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "modifier_group.deleted", { entity: "modifier_group", entityId: groupId });
    await done(ctx);
  });
}

// ---------------------------------------------------------------------------
// Menus (lunch / dinner / AYCE / takeaway) and price lists
// ---------------------------------------------------------------------------

export async function saveMenu(token: string, values: unknown) {
  return staffAction(token, EDIT, async (ctx) => {
    const parsed = menuSchema.safeParse(values);
    if (!parsed.success) invalid(parsed.error);
    const { id, ...data } = parsed.data;
    const col = refs.menus(ctx.tenant.id);
    if (id) await col.doc(id).update({ ...data, updatedAt: nowIso() });
    else await col.add({ ...data, sort: (await col.count().get()).data().count, createdAt: nowIso(), updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), id ? "menu.updated" : "menu.created", { entity: "menu", entityId: id, diff: { name: data.name.it } });
    await done(ctx);
  });
}

export async function deleteMenu(token: string, menuId: string) {
  return staffAction(token, EDIT, async (ctx) => {
    const t = ctx.tenant.id;
    const batch = db().batch();
    batch.delete(refs.menus(t).doc(menuId));
    // Detach categories and price-list overrides that referenced this menu.
    const cats = await refs.categories(t).where("menuIds", "array-contains", menuId).get();
    cats.docs.forEach((d) => batch.update(d.ref, { menuIds: (d.get("menuIds") as string[]).filter((m) => m !== menuId) }));
    const prods = await refs.products(t).get();
    prods.docs.forEach((d) => {
      const prices = { ...(d.get("prices") ?? {}) };
      if (menuId in prices) {
        delete prices[menuId];
        batch.update(d.ref, { prices });
      }
    });
    await batch.commit();
    await logTenantAction(t, staffActor(ctx), "menu.deleted", { entity: "menu", entityId: menuId });
    await done(ctx);
  });
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function saveDepartment(token: string, values: { id?: string; name: string }) {
  return staffAction(token, { permission: "settings.manage" }, async (ctx) => {
    const name = values.name?.trim();
    if (!name || name.length > 40) throw new UserError("Nome reparto non valido.");
    const col = refs.departments(ctx.tenant.id);
    if (values.id) await col.doc(values.id).update({ name });
    else await col.add({ name, sort: (await col.count().get()).data().count, printerId: null });
    await done(ctx);
  });
}

export async function deleteDepartment(token: string, departmentId: string) {
  return staffAction(token, { permission: "settings.manage" }, async (ctx) => {
    const used = await refs.products(ctx.tenant.id).where("departmentId", "==", departmentId).limit(1).get();
    if (!used.empty) throw new UserError("Ci sono prodotti assegnati a questo reparto.");
    await refs.departments(ctx.tenant.id).doc(departmentId).delete();
    await done(ctx);
  });
}

// ---------------------------------------------------------------------------
// Translation & CSV import
// ---------------------------------------------------------------------------

export async function translate(token: string, texts: string[], target: string) {
  return staffAction(token, { ...EDIT, module: "multilang" }, async () => {
    if (!/^[a-z]{2}$/.test(target) || texts.length > 50) throw new UserError("Richiesta non valida.");
    try {
      return await translateTexts(texts.map((t) => t.slice(0, 2000)), target);
    } catch (e) {
      throw new UserError((e as Error).message);
    }
  });
}

/** Imports products from CSV (see src/domain/menu-csv.ts for columns). */
export async function importProductsCsv(token: string, formData: FormData) {
  return staffAction(token, EDIT, async (ctx) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Seleziona un file CSV.");
    if (file.size > 2 * 1024 * 1024) throw new UserError("File troppo grande (max 2 MB).");
    const { rows, errors } = parseProductsCsv(await file.text());
    if (errors.length) throw new UserError(errors.slice(0, 3).join(" · "));
    const t = ctx.tenant.id;

    if (ctx.tenant.planId) {
      const max = (await refs.plans().doc(ctx.tenant.planId).get()).get("maxProducts") as number | null;
      const count = (await refs.products(t).count().get()).data().count;
      const creating = rows.filter((r) => !r.id).length;
      if (max != null && count + creating > max) throw new UserError(`Il piano consente al massimo ${max} prodotti.`);
    }

    // Resolve or create categories by Italian name.
    const cats = await refs.categories(t).get();
    const byName = new Map(cats.docs.map((d) => [slugify(d.get("name.it") ?? ""), d.id]));
    const deps = await refs.departments(t).get();
    const depByName = new Map(deps.docs.map((d) => [slugify(d.get("name") ?? ""), d.id]));
    let sort = cats.size;
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      let categoryId = byName.get(slugify(r.category));
      if (!categoryId) {
        categoryId = (
          await refs.categories(t).add({
            name: { it: r.category }, description: {}, parentId: null, icon: null, imagePath: null,
            sort: sort++, active: true, visibility: null, menuIds: [], createdAt: nowIso(), updatedAt: nowIso(),
          })
        ).id;
        byName.set(slugify(r.category), categoryId);
      }
      const data = {
        categoryId,
        name: r.name,
        description: r.description,
        priceCents: r.priceCents,
        vatRateBp: r.vatRateBp,
        departmentId: r.department ? (depByName.get(slugify(r.department)) ?? null) : null,
        allergens: r.allergens,
        tags: r.tags,
        isFrozen: r.isFrozen,
        available: r.available,
        updatedAt: nowIso(),
      };
      const existing = r.id ? await refs.products(t).doc(r.id).get() : null;
      if (existing?.exists) {
        await existing.ref.update(data);
        updated++;
      } else {
        await refs.products(t).add({
          ...data, prices: {}, hidden: false, images: [], sort: 999 + created, modifierGroupIds: [],
          ayceIncluded: false, ayceMaxQty: null, createdAt: nowIso(),
        });
        created++;
      }
    }
    await logTenantAction(t, staffActor(ctx), "menu.csv_imported", { diff: { created, updated } });
    await done(ctx);
    return { created, updated };
  });
}
