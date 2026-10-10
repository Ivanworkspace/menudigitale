import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { translationAvailable } from "@/server/translate";
import { CategoriesEditor } from "./categories-editor";

export const metadata = { title: "Categorie" };

export default async function CategoriesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const data = await loadMenuData(ctx.tenant.id);
  const counts: Record<string, number> = {};
  for (const p of data.products) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
  return (
    <CategoriesEditor
      token={token}
      categories={data.categories}
      menus={data.menus}
      counts={counts}
      languages={ctx.modules.multilang ? ctx.tenant.settings.languages : ["it"]}
      canTranslate={ctx.modules.multilang && translationAvailable()}
    />
  );
}
