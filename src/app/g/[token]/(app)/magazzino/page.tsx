import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { Ingredient } from "@/domain/inventory";
import { StockBoard } from "./stock-board";

export const metadata = { title: "Magazzino" };

export default async function InventoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "inventory", permission: "inventory.manage" });
  const items = await refs.ingredients(ctx.tenant.id).get().then(allWithId<Ingredient>);
  return <StockBoard token={token} items={items.sort((a, b) => a.name.localeCompare(b.name, "it"))} />;
}
