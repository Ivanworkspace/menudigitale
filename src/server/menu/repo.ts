import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { refs, allWithId, nowIso } from "@/server/db";
import type { Category, Department, Menu, ModifierGroup, Product } from "@/domain/menu";

export type MenuData = {
  menus: Menu[];
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroup[];
  departments: Department[];
};

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** Uncached read of the whole menu of a tenant (staff panel). */
export async function loadMenuData(tenantId: string): Promise<MenuData> {
  const [menus, categories, products, modifierGroups, departments] = await Promise.all([
    refs.menus(tenantId).get().then(allWithId<Menu>),
    refs.categories(tenantId).get().then(allWithId<Category>),
    refs.products(tenantId).get().then(allWithId<Product>),
    refs.modifierGroups(tenantId).get().then(allWithId<ModifierGroup>),
    refs.departments(tenantId).get().then(allWithId<Department>),
  ]);
  return {
    menus: menus.sort(bySort),
    categories: categories.sort(bySort),
    products: products.sort(bySort),
    modifierGroups: modifierGroups.sort(bySort),
    departments: departments.sort(bySort),
  };
}

export const menuTag = (tenantId: string) => `menu:${tenantId}`;

/** Cached read for the public menu; invalidated by `menuChanged`. */
export function loadPublicMenuData(tenantId: string): Promise<MenuData> {
  return unstable_cache(() => loadMenuData(tenantId), ["public-menu", tenantId], {
    tags: [menuTag(tenantId)],
    revalidate: 300,
  })();
}

/**
 * Call after any menu change: invalidates the public cache and bumps the
 * version that open public menus poll to refresh themselves.
 */
export async function menuChanged(tenantId: string) {
  revalidateTag(menuTag(tenantId));
  await refs.tenant(tenantId).update({ menuVersion: nowIso() });
}
