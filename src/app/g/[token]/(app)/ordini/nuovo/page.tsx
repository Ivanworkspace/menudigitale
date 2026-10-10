import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { refs, allWithId } from "@/server/db";
import type { TableSession } from "@/domain/orders";
import { WaiterOrder } from "./waiter-order";

export const metadata = { title: "Nuovo ordine" };

export default async function NewOrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sessione?: string }> }) {
  const { token } = await params;
  const { sessione } = await searchParams;
  const ctx = await requireStaffPage(token, { module: "orders", permission: "orders.create" });
  const [data, sessions] = await Promise.all([
    loadMenuData(ctx.tenant.id),
    refs.tableSessions(ctx.tenant.id).where("status", "in", ["open", "bill_requested"]).get().then(allWithId<TableSession>),
  ]);
  return (
    <WaiterOrder
      token={token}
      basePath={ctx.basePath}
      initialSessionId={sessione ?? null}
      sessions={sessions
        .map((s) => ({ id: s.id, label: s.tableLabel, covers: s.covers + s.coversChildren, mode: s.mode, menuId: s.menuId }))
        .sort((a, b) => a.label.localeCompare(b.label, "it", { numeric: true }))}
      categories={data.categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name.it ?? "", icon: c.icon }))}
      products={data.products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name.it ?? "",
        priceCents: p.priceCents,
        prices: p.prices,
        available: p.available,
        ayceIncluded: p.ayceIncluded,
        groups: p.modifierGroupIds,
      }))}
      groups={data.modifierGroups.map((g) => ({
        id: g.id,
        name: g.name.it ?? "",
        kind: g.kind,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name.it ?? "", priceDeltaCents: o.priceDeltaCents, available: o.available })),
      }))}
    />
  );
}
