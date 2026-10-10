import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { ProductsBoard } from "./products-board";

export const metadata = { title: "Menu" };

export default async function MenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const data = await loadMenuData(ctx.tenant.id);
  return <ProductsBoard token={token} basePath={ctx.basePath} categories={data.categories} products={data.products} />;
}
