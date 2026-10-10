import "server-only";
import { refs, db, nowIso } from "@/server/db";
import { UserError } from "@/server/action";
import { notify } from "@/server/notify";
import type { ItemStatus, Order, OrderItem } from "@/domain/orders";

const ALLOWED: Record<ItemStatus, ItemStatus[]> = {
  held: ["new"],
  new: ["in_progress", "ready", "served"],
  in_progress: ["ready", "new", "served"],
  ready: ["served", "in_progress"],
  served: ["ready"],
  cancelled: [],
};

/**
 * Updates the status of some items of an order (KDS taps, "all ready",
 * "served"). Records timestamps for prep-time statistics.
 */
export async function setItemsStatus(tenantId: string, orderId: string, itemIds: string[] | "all", status: ItemStatus, departmentId?: string | null) {
  let label = "";
  let becameReady = false;
  await db().runTransaction(async (tx) => {
    const ref = refs.orders(tenantId).doc(orderId);
    const o = (await tx.get(ref)).data() as Order | undefined;
    if (!o || o.status !== "sent") throw new UserError("Comanda non trovata.");
    label = o.tableLabel;
    const now = nowIso();
    const wasReady = isAllReady(o.items);
    const items = o.items.map((i) => {
      const target = itemIds === "all" ? (!departmentId || i.departmentId === departmentId) : itemIds.includes(i.id);
      if (!target || i.status === status || !ALLOWED[i.status].includes(status)) return i;
      const extra: Partial<OrderItem> & Record<string, string> = {};
      if (status === "in_progress") extra.startedAt = now;
      if (status === "ready") extra.readyAt = now;
      if (status === "served") extra.servedAt = now;
      return { ...i, ...extra, status, statusAt: now };
    });
    becameReady = !wasReady && isAllReady(items);
    tx.update(ref, { items });
  });
  if (becameReady) await notify(tenantId, { type: "order_ready", title: `Pronto da servire · Tavolo ${label}`, urgent: true });
}

function isAllReady(items: OrderItem[]) {
  const live = items.filter((i) => i.status !== "cancelled" && i.status !== "held");
  return live.length > 0 && live.every((i) => i.status === "ready" || i.status === "served") && live.some((i) => i.status === "ready");
}
