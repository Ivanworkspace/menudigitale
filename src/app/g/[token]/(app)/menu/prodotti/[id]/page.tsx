import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { translationAvailable } from "@/server/translate";
import { ProductForm } from "./product-form";

export const metadata = { title: "Prodotto" };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { token, id } = await params;
  const { categoria } = await searchParams;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const data = await loadMenuData(ctx.tenant.id);
  const product = id === "nuovo" ? null : (data.products.find((p) => p.id === id) ?? null);
  if (id !== "nuovo" && !product) notFound();
  const languages = ctx.modules.multilang ? ctx.tenant.settings.languages : ["it"];
  return (
    <ProductForm
      token={token}
      basePath={ctx.basePath}
      product={product}
      defaultCategoryId={categoria ?? data.categories[0]?.id ?? ""}
      categories={data.categories}
      menus={data.menus}
      modifierGroups={data.modifierGroups}
      departments={data.departments}
      languages={languages.includes("it") ? languages : ["it", ...languages]}
      canTranslate={ctx.modules.multilang && translationAvailable()}
      ayceEnabled={ctx.modules.orders}
    />
  );
}
