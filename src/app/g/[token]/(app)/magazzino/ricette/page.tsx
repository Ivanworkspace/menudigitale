import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { loadMenuData } from "@/server/menu/repo";
import type { Ingredient } from "@/domain/inventory";
import { RecipesEditor } from "./recipes-editor";

export const metadata = { title: "Ricette" };

export default async function RecipesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "inventory", permission: "inventory.manage" });
  const [menu, ingredients] = await Promise.all([loadMenuData(ctx.tenant.id), refs.ingredients(ctx.tenant.id).get().then(allWithId<Ingredient>)]);
  return (
    <RecipesEditor
      token={token}
      products={menu.products.map((p) => ({ id: p.id, name: p.name.it ?? "", category: menu.categories.find((c) => c.id === p.categoryId)?.name.it ?? "", recipe: p.recipe ?? [] }))}
      ingredients={ingredients.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, unit: i.unit })).sort((a, b) => a.name.localeCompare(b.name, "it"))}
    />
  );
}
