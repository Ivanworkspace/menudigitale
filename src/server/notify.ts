import "server-only";
import { refs, nowIso, expireIn } from "@/server/db";
import { pushForNotification } from "@/server/push";

export type NotificationType =
  | "new_order"
  | "order_pending"
  | "order_ready"
  | "call_waiter"
  | "request_bill"
  | "product_sold_out"
  | "stock_low"
  | "order_blocked"
  | "message";

/**
 * Realtime notification for staff devices (Firestore listener + sound).
 * Auto-deleted after 2 days by TTL on `expireAt`.
 */
export async function notify(
  tenantId: string,
  n: { type: NotificationType; title: string; body?: string; tableId?: string | null; departmentId?: string | null; urgent?: boolean },
) {
  await refs.notifications(tenantId).add({
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    tableId: n.tableId ?? null,
    departmentId: n.departmentId ?? null,
    urgent: !!n.urgent,
    createdAt: nowIso(),
    expireAt: expireIn(2 * 86_400_000),
  });
  await pushForNotification(tenantId, n);
}
