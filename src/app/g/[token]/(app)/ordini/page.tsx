import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { OrdersBoard } from "./orders-board";

export const metadata = { title: "Ordini" };

export default async function OrdersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "orders", permission: "orders.create" });
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const blocks = await refs.orderBlocks(ctx.tenant.id).where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(20).get();
  return (
    <OrdersBoard
      token={token}
      basePath={ctx.basePath}
      since={since}
      blocks={allWithId<{ id: string; tableLabel: string; reason: string; distanceM: number | null; createdAt: string }>(blocks)}
      canApprove={ctx.permissions.has("orders.approve")}
    />
  );
}
