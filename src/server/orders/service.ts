import "server-only";
import { refs, db, nowIso, FieldValue } from "@/server/db";
import { UserError } from "@/server/action";
import { notify } from "@/server/notify";
import { loadMenuData, type MenuData } from "@/server/menu/repo";
import { refreshTableStatus, type Actor } from "@/server/sala/service";
import { categoryInMenu, priceLine, tr, type ModifierSelection } from "@/domain/menu";
import { checkAyceRound, DEFAULT_AYCE } from "@/domain/ayce";
import { orderTotal, type Order, type OrderItem, type TableSession } from "@/domain/orders";
import type { Tenant } from "@/server/db/types";
import { randomToken } from "@/server/crypto";
import { printOrderItems } from "@/server/printing";
import { getTenant } from "@/server/tenancy/resolve";
import { applyRecipeConsumption } from "@/server/inventory";

export type LineInput = {
  productId: string;
  qty: number;
  modifiers: ModifierSelection[];
  notes?: string;
  course?: number;
};

const MAX_LINES = 60;
const MAX_QTY = 50;

/**
 * Turns client lines into priced order items. Prices, VAT, department and
 * AYCE inclusion always come from the database, never from the browser.
 */
export function buildItems(
  data: MenuData,
  session: Pick<TableSession, "menuId" | "currentCourse" | "mode">,
  lines: LineInput[],
  opts: { forStaff: boolean },
): OrderItem[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new UserError("L'ordine è vuoto.");
  if (lines.length > MAX_LINES) throw new UserError("Troppe righe nell'ordine.");
  const products = new Map(data.products.map((p) => [p.id, p]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const now = nowIso();
  return lines.map((l) => {
    const p = products.get(l.productId);
    if (!p) throw new UserError("Un prodotto non è più disponibile.");
    const cat = categories.get(p.categoryId);
    if (!p.available) throw new UserError(`«${tr(p.name, "it")}» è esaurito.`);
    if (!opts.forStaff && (p.hidden || !cat?.active || !categoryInMenu(cat, session.menuId))) {
      throw new UserError(`«${tr(p.name, "it")}» non è ordinabile.`);
    }
    const qty = Math.floor(Number(l.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) throw new UserError("Quantità non valida.");
    const priced = priceLine(p, data.modifierGroups, Array.isArray(l.modifiers) ? l.modifiers : [], session.menuId);
    const course = Math.min(Math.max(Math.floor(Number(l.course ?? 1)) || 1, 1), 5);
    return {
      id: randomToken(6),
      productId: p.id,
      name: p.name,
      qty,
      unitPriceCents: priced.unitPriceCents,
      vatRateBp: p.vatRateBp,
      modifiers: priced.modifiers.map((m) => ({ groupName: m.groupName, name: m.name, priceDeltaCents: m.priceDeltaCents })),
      notes: String(l.notes ?? "").slice(0, 200),
      course,
      departmentId: p.departmentId,
      ayceIncluded: session.mode === "ayce" && p.ayceIncluded,
      status: course > session.currentCourse ? "held" : "new",
      statusAt: now,
    };
  });
}

/**
 * Creates an order inside a transaction that re-reads the session, applies
 * AYCE round rules and updates counters atomically.
 */
export async function createOrder(
  tenant: Tenant,
  sessionId: string,
  lines: LineInput[],
  opts: {
    source: "qr" | "waiter";
    actor: Actor;
    deviceId?: string | null;
    notes?: string;
    needsApproval?: boolean;
    approvalReason?: Order["approvalReason"];
    urgent?: boolean;
    data?: MenuData;
  },
): Promise<{ orderId: string; status: Order["status"] }> {
  const t = tenant.id;
  const data = opts.data ?? (await loadMenuData(t));
  const orderRef = refs.orders(t).doc();
  const month = nowIso().slice(0, 7);
  let result: { orderId: string; status: Order["status"] } = { orderId: orderRef.id, status: "sent" };
  let label = "";
  let created: (Omit<Order, "id"> & { id: string }) | null = null;

  await db().runTransaction(async (tx) => {
    const sRef = refs.tableSessions(t).doc(sessionId);
    const tenantRef = refs.tenant(t);
    const [sSnap, tSnap] = await Promise.all([tx.get(sRef), tx.get(tenantRef)]);
    const s = sSnap.data() as TableSession | undefined;
    if (!s || s.status === "closed") throw new UserError("Il tavolo non è aperto.");
    if (s.status === "bill_requested" && opts.source === "qr") throw new UserError("È già stato richiesto il conto.");
    label = s.tableLabel;
    const items = buildItems(data, s, lines, { forStaff: opts.source === "waiter" });
    const isAyce = s.mode === "ayce" && !!s.ayce;

    let round: number | null = null;
    const sessionPatch: Record<string, unknown> = {
      ordersCount: FieldValue.increment(1),
      lastOrderAt: nowIso(),
      totalCents: FieldValue.increment(orderTotal(items, isAyce)),
    };
    if (isAyce) {
      const cfg = tenant.settings.ayce ?? DEFAULT_AYCE;
      const products = new Map(data.products.map((p) => [p.id, p]));
      const check = checkAyceRound(
        cfg,
        { covers: s.covers, coversChildren: s.coversChildren, openedAt: s.openedAt, lastRoundAt: s.ayce!.lastRoundAt, includedQtyByProduct: s.ayce!.includedQtyByProduct },
        items.map((i) => ({ productId: i.productId, qty: i.qty, included: i.ayceIncluded, maxQty: products.get(i.productId)?.ayceMaxQty ?? null })),
        new Date(),
      );
      // Staff can override round timing/limits (e.g. a forgotten dish), not the guests.
      if (!check.ok && opts.source === "qr") throw new UserError(check.message);
      if (check.ok && check.includedPieces > 0) {
        round = s.ayce!.rounds + 1;
        sessionPatch["ayce.rounds"] = round;
        sessionPatch["ayce.lastRoundAt"] = nowIso();
        for (const i of items.filter((x) => x.ayceIncluded)) {
          sessionPatch[`ayce.includedQtyByProduct.${i.productId}`] = FieldValue.increment(i.qty);
        }
      }
    }

    const status: Order["status"] = opts.needsApproval ? "pending_approval" : "sent";
    const order: Omit<Order, "id"> = {
      tableSessionId: sessionId,
      tableId: s.tableId,
      tableLabel: s.tableLabel,
      source: opts.source,
      status,
      approvalReason: opts.needsApproval ? (opts.approvalReason ?? "first_order") : null,
      items,
      notes: String(opts.notes ?? "").slice(0, 300),
      round,
      totalCents: orderTotal(items, isAyce),
      createdAt: nowIso(),
      sentAt: status === "sent" ? nowIso() : null,
      createdBy: opts.actor.id,
      createdByName: opts.actor.name,
      deviceId: opts.deviceId ?? null,
      approvedBy: null,
      urgent: !!opts.urgent,
    };
    tx.create(orderRef, order);
    created = { ...order, id: orderRef.id };
    if (opts.source === "waiter") sessionPatch.firstOrderApproved = true;
    tx.update(sRef, sessionPatch);
    const stats = tSnap.get("stats") as { ordersMonth?: string } | undefined;
    tx.update(
      tenantRef,
      stats?.ordersMonth === month
        ? { "stats.ordersThisMonth": FieldValue.increment(1), lastActivityAt: nowIso() }
        : { stats: { ordersMonth: month, ordersThisMonth: 1 }, lastActivityAt: nowIso() },
    );
    result = { orderId: orderRef.id, status };
  });

  if (result.status === "pending_approval") {
    await notify(t, { type: "order_pending", title: `Tavolo ${label}: ordine da confermare`, tableId: null, urgent: true });
    await refreshTableStatus(t, sessionId);
  } else {
    await notify(t, { type: "new_order", title: `Nuovo ordine · Tavolo ${label}` });
    const c = created as (Omit<Order, "id"> & { id: string }) | null;
    if (c) {
      await printOrderItems(tenant, c, c.items.filter((i) => i.status === "new"));
      await applyRecipeConsumption(t, c.items, -1, { reason: "sale", orderId: c.id, by: opts.actor.name });
    }
  }
  return result;
}

export async function approveOrder(tenantId: string, orderId: string, actor: Actor, approve: boolean) {
  let sessionId = "";
  let label = "";
  let approved: Order | null = null;
  await db().runTransaction(async (tx) => {
    const ref = refs.orders(tenantId).doc(orderId);
    const o = (await tx.get(ref)).data() as Order | undefined;
    if (!o) throw new UserError("Ordine non trovato.");
    if (o.status !== "pending_approval") throw new UserError("L'ordine è già stato gestito.");
    approved = { ...o, id: orderId };
    sessionId = o.tableSessionId;
    label = o.tableLabel;
    const sRef = refs.tableSessions(tenantId).doc(o.tableSessionId);
    if (approve) {
      tx.update(ref, { status: "sent", approvedBy: actor.id, sentAt: nowIso() });
      tx.update(sRef, { firstOrderApproved: true });
    } else {
      tx.update(ref, { status: "rejected", approvedBy: actor.id });
      tx.update(sRef, { totalCents: FieldValue.increment(-o.totalCents) });
    }
  });
  await refreshTableStatus(tenantId, sessionId);
  if (approve) {
    await notify(tenantId, { type: "new_order", title: `Nuovo ordine · Tavolo ${label}` });
    const tenant = await getTenant(tenantId);
    const a = approved as Order | null;
    if (tenant && a) {
      await printOrderItems(tenant, a, a.items.filter((i) => i.status === "new"));
      await applyRecipeConsumption(tenantId, a.items, -1, { reason: "sale", orderId: a.id, by: actor.name });
    }
  }
}

export async function cancelItem(tenantId: string, orderId: string, itemId: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new UserError("Indica il motivo dell'annullamento.");
  let label = "";
  let name = "";
  let departmentId: string | null = null;
  let printable: { order: Order; item: OrderItem } | null = null;
  await db().runTransaction(async (tx) => {
    const ref = refs.orders(tenantId).doc(orderId);
    const o = (await tx.get(ref)).data() as Order | undefined;
    if (!o) throw new UserError("Ordine non trovato.");
    const s = (await tx.get(refs.tableSessions(tenantId).doc(o.tableSessionId))).data() as TableSession | undefined;
    const item = o.items.find((i) => i.id === itemId);
    if (!item || item.status === "cancelled") throw new UserError("Prodotto non trovato o già annullato.");
    label = o.tableLabel;
    name = tr(item.name, "it");
    departmentId = item.departmentId;
    if (o.status === "sent" && item.status !== "held") printable = { order: { ...o, id: orderId }, item };
    const isAyce = s?.mode === "ayce";
    const items = o.items.map((i) =>
      i.id === itemId ? { ...i, status: "cancelled" as const, statusAt: nowIso(), cancelReason: reason.trim().slice(0, 200), cancelledBy: actor.name } : i,
    );
    const newTotal = orderTotal(items, isAyce);
    tx.update(ref, { items, totalCents: newTotal });
    if (s && s.status !== "closed") {
      const patch: Record<string, unknown> = { totalCents: FieldValue.increment(newTotal - o.totalCents) };
      if (isAyce && item.ayceIncluded) patch[`ayce.includedQtyByProduct.${item.productId}`] = FieldValue.increment(-item.qty);
      tx.update(refs.tableSessions(tenantId).doc(o.tableSessionId), patch);
    }
  });
  await notify(tenantId, { type: "message", title: `Annullato: ${name} · Tavolo ${label}`, body: reason, departmentId, urgent: true });
  const pr = printable as { order: Order; item: OrderItem } | null;
  if (pr) {
    const tenant = await getTenant(tenantId);
    if (tenant) await printOrderItems(tenant, { ...pr.order, notes: `Motivo: ${reason}` }, [pr.item], { cancelled: true });
    // Restock only if the dish was not started yet.
    if (pr.item.status === "new") await applyRecipeConsumption(tenantId, [pr.item], 1, { reason: "cancel", orderId: pr.order.id, by: actor.name });
  }
}

/** "Segue": releases the next course to the kitchen. */
export async function sendNextCourse(tenantId: string, sessionId: string) {
  const orders = await refs.orders(tenantId).where("tableSessionId", "==", sessionId).where("status", "==", "sent").get();
  let course = 0;
  let label = "";
  const released: { order: Order; items: OrderItem[] }[] = [];
  await db().runTransaction(async (tx) => {
    released.length = 0;
    const sRef = refs.tableSessions(tenantId).doc(sessionId);
    const s = (await tx.get(sRef)).data() as TableSession | undefined;
    if (!s || s.status === "closed") throw new UserError("Sessione non attiva.");
    course = s.currentCourse + 1;
    label = s.tableLabel;
    const now = nowIso();
    tx.update(sRef, { currentCourse: course });
    for (const d of orders.docs) {
      const before = d.get("items") as OrderItem[];
      const items = before.map((i) => (i.status === "held" && i.course <= course ? { ...i, status: "new" as const, statusAt: now } : i));
      const newly = items.filter((i, k) => before[k].status === "held" && i.status === "new");
      if (newly.length) released.push({ order: { id: d.id, ...(d.data() as Omit<Order, "id">) }, items: newly });
      tx.update(d.ref, { items });
    }
  });
  await notify(tenantId, { type: "message", title: `Tavolo ${label}: segue uscita ${course}`, urgent: true });
  const tenant = await getTenant(tenantId);
  if (tenant) for (const r of released) await printOrderItems(tenant, r.order, r.items);
  return course;
}

export async function recentOrdersCount(tenantId: string, sessionId: string, seconds = 60): Promise<number> {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const snap = await refs.orders(tenantId).where("tableSessionId", "==", sessionId).where("createdAt", ">=", since).count().get();
  return snap.data().count;
}
