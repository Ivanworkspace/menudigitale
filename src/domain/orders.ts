/**
 * Tables, sessions and orders: shared types and pure helpers.
 */
import type { I18n } from "./menu";
import { isVisibleAt } from "./menu";
import type { MenuMode } from "./modules";
import type { TakeawayInfo } from "./takeaway";

export type TableShape = "square" | "round" | "rect";
export type TableStatus = "free" | "occupied" | "pending" | "bill_requested" | "to_clean" | "reserved";

export type Room = { id: string; name: string; sort: number };

export type Table = {
  id: string;
  roomId: string;
  label: string;
  seats: number;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: TableShape;
  qrToken: string;
  active: boolean;
  status: TableStatus;
  currentSessionId: string | null;
  /** When merged into another table's session. */
  mergedInto: string | null;
  sort: number;
};

export type SessionStatus = "open" | "bill_requested" | "closed";

export type AyceState = {
  slot: "lunch" | "dinner" | "holiday";
  adultCents: number;
  childCents: number;
  lastRoundAt: string | null;
  rounds: number;
  includedQtyByProduct: Record<string, number>;
};

export type TableSession = {
  id: string;
  tableId: string;
  tableIds: string[];
  tableLabel: string;
  status: SessionStatus;
  mode: MenuMode;
  menuId: string | null;
  covers: number;
  coversChildren: number;
  waiterId: string | null;
  waiterName: string | null;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  accessCode: string | null;
  firstOrderApproved: boolean;
  ordersCount: number;
  lastOrderAt: string | null;
  currentCourse: number;
  totalCents: number;
  ayce: AyceState | null;
  /** Set on takeaway orders (no physical table). */
  takeaway?: TakeawayInfo | null;
};

export type ItemStatus = "held" | "new" | "in_progress" | "ready" | "served" | "cancelled";

export type OrderItem = {
  id: string;
  productId: string;
  name: I18n;
  qty: number;
  unitPriceCents: number;
  vatRateBp: number;
  modifiers: { groupName: I18n; name: I18n; priceDeltaCents: number }[];
  notes: string;
  course: number;
  departmentId: string | null;
  ayceIncluded: boolean;
  status: ItemStatus;
  statusAt: string;
  cancelReason?: string | null;
  cancelledBy?: string | null;
};

export type OrderStatus = "pending_approval" | "sent" | "rejected" | "cancelled";

export type Order = {
  id: string;
  tableSessionId: string;
  tableId: string;
  tableLabel: string;
  source: "qr" | "waiter" | "takeaway";
  status: OrderStatus;
  approvalReason: "first_order" | "geo" | "takeaway" | null;
  items: OrderItem[];
  notes: string;
  round: number | null;
  totalCents: number;
  createdAt: string;
  /** When the order reached the kitchen (after approval, if any). */
  sentAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  deviceId: string | null;
  approvedBy: string | null;
  urgent: boolean;
};

export type ServiceRequest = {
  id: string;
  tableSessionId: string;
  tableId: string;
  tableLabel: string;
  type: "call_waiter" | "request_bill";
  status: "open" | "done";
  createdAt: string;
  handledBy: string | null;
};

/** Customer-facing progress of an order. */
export type OrderProgress = "pending" | "sent" | "preparing" | "ready" | "served" | "cancelled";

export function orderProgress(o: Pick<Order, "status" | "items">): OrderProgress {
  if (o.status === "pending_approval") return "pending";
  if (o.status !== "sent") return "cancelled";
  const live = o.items.filter((i) => i.status !== "cancelled");
  if (!live.length) return "cancelled";
  if (live.every((i) => i.status === "served")) return "served";
  if (live.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (live.some((i) => i.status === "in_progress" || i.status === "ready" || i.status === "served")) return "preparing";
  return "sent";
}

export function lineTotal(i: Pick<OrderItem, "qty" | "unitPriceCents" | "status" | "ayceIncluded">, ayce = false): number {
  if (i.status === "cancelled") return 0;
  if (ayce && i.ayceIncluded) return 0;
  return i.qty * i.unitPriceCents;
}

export function orderTotal(items: OrderItem[], ayce = false): number {
  return items.reduce((s, i) => s + lineTotal(i, ayce), 0);
}

/** Effective menu mode now: first matching time slot, else the default. */
export function currentMenuMode(
  defaultMode: MenuMode,
  schedules: { weekdays: number[]; from: string; to: string; mode: MenuMode }[] | undefined,
  clock: { weekday: number; time: string },
): MenuMode {
  const hit = (schedules ?? []).find((s) => isVisibleAt({ weekdays: s.weekdays, from: s.from, to: s.to }, clock));
  return hit?.mode ?? defaultMode;
}

/** 4-digit code avoiding trivial sequences; changes at every opening. */
export function newAccessCode(random: () => number = Math.random): string {
  for (;;) {
    const c = Math.floor(random() * 10_000).toString().padStart(4, "0");
    if (!/^(\d)\1{3}$/.test(c) && !"0123456789".includes(c) && !"9876543210".includes(c)) return c;
  }
}

export function tableStatusFor(session: Pick<TableSession, "status"> | null, opts: { pendingApproval: boolean }): TableStatus {
  if (!session || session.status === "closed") return "free";
  if (session.status === "bill_requested") return "bill_requested";
  return opts.pendingApproval ? "pending" : "occupied";
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  free: "Libero",
  occupied: "Occupato",
  pending: "Ordine in attesa",
  bill_requested: "Conto richiesto",
  to_clean: "Da pulire",
  reserved: "Prenotato",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  held: "In attesa (segue)",
  new: "Inviato",
  in_progress: "In preparazione",
  ready: "Pronto",
  served: "Servito",
  cancelled: "Annullato",
};
