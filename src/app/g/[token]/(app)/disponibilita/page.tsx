import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { PageHeader } from "@/components/ui/card";
import { AvailabilityBoard } from "./availability-board";

export const metadata = { title: "Disponibilità" };

export default async function AvailabilityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "products.availability" });
  const { categories, products } = await loadMenuData(ctx.tenant.id);
  return (
    <>
      <PageHeader title="Disponibilità prodotti" description="Segna un prodotto come esaurito con un tocco: il menu si aggiorna subito." />
      <AvailabilityBoard
        token={token}
        categories={categories.map((c) => ({ id: c.id, name: c.name.it ?? "" }))}
        products={products.map((p) => ({ id: p.id, categoryId: p.categoryId, name: p.name.it ?? "", available: p.available }))}
      />
    </>
  );
}
