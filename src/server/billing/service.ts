import "server-only";
import { refs, db, nowIso, withId, allWithId, FieldValue } from "@/server/db";
import { UserError } from "@/server/action";
import { randomToken } from "@/server/crypto";
import { closeSession, getSession } from "@/server/sala/service";
import { computeBill, equalSplit, paidCents, selectionAmount, type Adjustment, type BillLine, type BillTotals, type Payment, type PaymentMethod } from "@/domain/billing";
import { tr } from "@/domain/menu";
import type { Order, TableSession } from "@/domain/orders";
import type { Tenant } from "@/server/db/types";
import { creditBillToCustomer } from "@/server/customers";
import { checkPromotion, type Promotion } from "@/domain/loyalty";
import { localClock } from "@/domain/menu";

export type BillPart = { id: string; label: string; amountCents: number; selection?: Record<string, number> | null };

export type Bill = {
  id: string;
  tableSessionId: string;
  tableLabel: string;
  status: "open" | "paid" | "void";
  covers: number;
  coversChildren: number;
  coverChargeCents: number;
  servicePctBp: number;
  ayce: { adults: number; children: number; adultCents: number; childCents: number; vatRateBp: number } | null;
  lines: BillLine[];
  adjustments: Adjustment[];
  parts: BillPart[];
  payments: Payment[];
  totals: BillTotals;
  number: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  customerId?: string | null;
  customerName?: string | null;
  promoIds?: string[];
};

export function billInput(b: Pick<Bill, "lines" | "covers" | "coversChildren" | "coverChargeCents" | "servicePctBp" | "adjustments" | "ayce">) {
  return {
    lines: b.lines,
    covers: b.covers + b.coversChildren,
    coverChargeCents: b.coverChargeCents,
    servicePctBp: b.servicePctBp,
    adjustments: b.adjustments,
    ayce: b.ayce,
  };
}

/** Aggregates the session's orders into bill lines (same product+options+price → one line). */
export function linesFromOrders(orders: Order[], ayce: boolean): BillLine[] {
  const map = new Map<string, BillLine>();
  for (const o of orders) {
    if (o.status !== "sent") continue;
    for (const i of o.items) {
      if (i.status === "cancelled") continue;
      if (ayce && i.ayceIncluded) continue;
      const mods = i.modifiers.map((m) => tr(m.name, "it")).join(", ");
      const key = `${i.productId}|${mods}|${i.unitPriceCents}|${i.vatRateBp}`;
      const cur = map.get(key);
      if (cur) cur.qty += i.qty;
      else
        map.set(key, {
          id: key.replace(/[^A-Za-z0-9]/g, "").slice(0, 40) + map.size,
          name: tr(i.name, "it") + (mods ? ` (${mods})` : ""),
          qty: i.qty,
          unitPriceCents: i.unitPriceCents,
          vatRateBp: i.vatRateBp,
        });
    }
  }
  return [...map.values()];
}

async function loadOrders(tenantId: string, sessionId: string) {
  return refs.orders(tenantId).where("tableSessionId", "==", sessionId).get().then(allWithId<Order>);
}

/** Returns the open bill of a session, creating it (or refreshing its lines). */
export async function openBill(tenant: Tenant, sessionId: string): Promise<Bill> {
  const t = tenant.id;
  const session = await getSession(t, sessionId);
  const orders = await loadOrders(t, sessionId);
  const isAyce = session.mode === "ayce" && !!session.ayce;
  const lines = linesFromOrders(orders, isAyce);
  const existing = await refs.bills(t).where("tableSessionId", "==", sessionId).where("status", "in", ["open", "paid"]).limit(1).get();

  const common = {
    tableLabel: session.tableLabel,
    covers: isAyce ? session.covers : session.covers,
    coversChildren: session.coversChildren,
    ayce: isAyce
      ? { adults: session.covers, children: session.coversChildren, adultCents: session.ayce!.adultCents, childCents: session.ayce!.childCents, vatRateBp: 1000 }
      : null,
    lines,
  };

  if (!existing.empty) {
    const doc = existing.docs[0];
    const b = { id: doc.id, ...doc.data() } as Bill;
    if (b.status === "paid") return b;
    const merged = { ...b, ...common };
    const totals = computeBill(billInput(merged));
    await doc.ref.update({ ...common, totals, updatedAt: nowIso() });
    return { ...merged, totals };
  }
  const draft = {
    tableSessionId: sessionId,
    status: "open" as const,
    coverChargeCents: isAyce ? 0 : tenant.settings.coverChargeCents,
    servicePctBp: tenant.settings.servicePctBp,
    adjustments: [] as Adjustment[],
    parts: [] as BillPart[],
    payments: [] as Payment[],
    number: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    closedAt: null,
    closedBy: null,
    ...common,
  };
  const totals = computeBill(billInput(draft));
  const ref = await refs.bills(t).add({ ...draft, totals });
  return { id: ref.id, ...draft, totals };
}

async function mutate(tenantId: string, billId: string, fn: (b: Bill) => Partial<Bill>): Promise<Bill> {
  let result: Bill | null = null;
  await db().runTransaction(async (tx) => {
    const ref = refs.bills(tenantId).doc(billId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new UserError("Conto non trovato.");
    const b = { id: snap.id, ...snap.data() } as Bill;
    if (b.status !== "open") throw new UserError("Il conto è già chiuso.");
    const patch = fn(b);
    const next = { ...b, ...patch };
    next.totals = computeBill(billInput(next));
    // Parts follow the total when it changes (equal splits are recomputed).
    tx.update(ref, { ...patch, totals: next.totals, updatedAt: nowIso() });
    result = next;
  });
  return result!;
}

export function addAdjustment(tenantId: string, billId: string, a: Omit<Adjustment, "id">) {
  if (a.value <= 0) throw new UserError("Valore non valido.");
  if (a.mode === "percent" && a.value > 10_000) throw new UserError("Percentuale non valida.");
  return mutate(tenantId, billId, (b) => ({ adjustments: [...b.adjustments, { ...a, id: randomToken(6) }] }));
}

export function removeAdjustment(tenantId: string, billId: string, adjustmentId: string) {
  return mutate(tenantId, billId, (b) => ({ adjustments: b.adjustments.filter((x) => x.id !== adjustmentId) }));
}

export async function setBillCovers(tenantId: string, billId: string, sessionId: string, covers: number, children: number) {
  await refs.tableSessions(tenantId).doc(sessionId).update({ covers, coversChildren: children });
  return mutate(tenantId, billId, (b) => ({
    covers,
    coversChildren: children,
    ayce: b.ayce ? { ...b.ayce, adults: covers, children } : null,
  }));
}

export function setService(tenantId: string, billId: string, servicePctBp: number, coverChargeCents: number) {
  return mutate(tenantId, billId, () => ({ servicePctBp, coverChargeCents }));
}

/** "Alla romana": replaces the unpaid parts with n equal parts of the remaining amount. */
export function splitEqual(tenantId: string, billId: string, n: number) {
  if (!(n >= 2 && n <= 30)) throw new UserError("Numero di parti non valido.");
  return mutate(tenantId, billId, (b) => {
    const totals = computeBill(billInput(b));
    const remaining = totals.totalCents - paidCents(b.payments);
    const paidParts = b.parts.filter((p) => partPaid(b, p.id) >= p.amountCents);
    return {
      parts: [
        ...paidParts,
        ...equalSplit(remaining, n).map((amountCents, i) => ({ id: randomToken(6), label: `Quota ${i + 1}/${n}`, amountCents, selection: null })),
      ],
    };
  });
}

/** "Conto separato" by items for one person/group. */
export function splitBySelection(tenantId: string, billId: string, label: string, selection: Record<string, number>, persons: number) {
  return mutate(tenantId, billId, (b) => {
    const input = billInput(b);
    const totals = computeBill(input);
    const amountCents = selectionAmount(input, totals, selection, { persons, totalPersons: Math.max(1, b.covers + b.coversChildren) });
    if (amountCents <= 0) throw new UserError("Seleziona almeno un prodotto.");
    return { parts: [...b.parts, { id: randomToken(6), label: label.slice(0, 40) || `Conto ${b.parts.length + 1}`, amountCents, selection }] };
  });
}

export function clearParts(tenantId: string, billId: string) {
  return mutate(tenantId, billId, (b) => ({ parts: b.parts.filter((p) => partPaid(b, p.id) > 0) }));
}

export function partPaid(b: Pick<Bill, "payments">, partId: string) {
  return b.payments.filter((p) => p.partId === partId).reduce((s, p) => s + p.amountCents, 0);
}

export function addPayment(
  tenantId: string,
  billId: string,
  p: { method: PaymentMethod; amountCents: number; tenderedCents?: number | null; partId?: string | null; by: string | null; externalId?: string | null },
) {
  return mutate(tenantId, billId, (b) => {
    if (p.externalId && b.payments.some((x) => (x as Payment & { externalId?: string }).externalId === p.externalId)) return {};
    const remaining = computeBill(billInput(b)).totalCents - paidCents(b.payments);
    if (p.amountCents <= 0) throw new UserError("Importo non valido.");
    if (p.amountCents > remaining) throw new UserError("L'importo supera il residuo da pagare.");
    if (p.partId && !b.parts.some((x) => x.id === p.partId)) throw new UserError("Quota non trovata.");
    const change = p.method === "cash" && p.tenderedCents ? Math.max(0, p.tenderedCents - p.amountCents) : null;
    return {
      payments: [
        ...b.payments,
        {
          id: randomToken(6),
          method: p.method,
          amountCents: p.amountCents,
          tenderedCents: p.tenderedCents ?? null,
          changeCents: change,
          partId: p.partId ?? null,
          at: nowIso(),
          by: p.by,
          ...(p.externalId ? { externalId: p.externalId } : {}),
        },
      ],
    };
  });
}

export function removePayment(tenantId: string, billId: string, paymentId: string) {
  return mutate(tenantId, billId, (b) => ({ payments: b.payments.filter((x) => x.id !== paymentId) }));
}

/** Closes the bill once fully paid, numbers it and frees the table. */
export async function closeBill(tenant: Tenant, billId: string, actorName: string | null) {
  const t = tenant.id;
  let sessionId = "";
  let credit: { customerId: string; total: number } | null = null;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.settings.timezone }).format(new Date());
  await db().runTransaction(async (tx) => {
    const ref = refs.bills(t).doc(billId);
    const counterRef = refs.counters(t).doc(`bills-${day}`);
    const [snap, counter] = await Promise.all([tx.get(ref), tx.get(counterRef)]);
    const b = { id: snap.id, ...snap.data() } as Bill;
    if (!snap.exists || b.status !== "open") throw new UserError("Conto non trovato o già chiuso.");
    const totals = computeBill(billInput(b));
    if (paidCents(b.payments) < totals.totalCents) throw new UserError("Il conto non è stato pagato per intero.");
    const number = ((counter.get("value") as number | undefined) ?? 0) + 1;
    tx.set(counterRef, { value: number }, { merge: true });
    tx.update(ref, { status: "paid", totals, number, closedAt: nowIso(), closedBy: actorName, businessDay: day });
    sessionId = b.tableSessionId;
    if (b.customerId) credit = { customerId: b.customerId, total: totals.totalCents };
  });
  const session = withId<TableSession>(await refs.tableSessions(t).doc(sessionId).get());
  if (session && session.status !== "closed") await closeSession(tenant, sessionId);
  await refs.tenant(t).update({ lastActivityAt: nowIso(), "stats.billsClosed": FieldValue.increment(1) });
  const c = credit as { customerId: string; total: number } | null;
  if (c) await creditBillToCustomer(tenant, c.customerId, billId, c.total);
}

export async function setBillCustomer(tenantId: string, billId: string, customerId: string | null) {
  let name: string | null = null;
  if (customerId) {
    const c = await refs.customers(tenantId).doc(customerId).get();
    if (!c.exists) throw new UserError("Cliente non trovato.");
    name = c.get("name");
  }
  return mutate(tenantId, billId, () => ({ customerId, customerName: name }));
}

/** Applies a discount code or an active happy hour to the bill. */
export async function applyPromotion(tenant: Tenant, billId: string, promo: { code?: string; promotionId?: string }) {
  const t = tenant.id;
  let p: Promotion | null = null;
  if (promo.code) {
    const snap = await refs.promotions(t).where("code", "==", promo.code.trim().toUpperCase()).limit(1).get();
    p = snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Promotion);
  } else if (promo.promotionId) {
    p = withId<Promotion>(await refs.promotions(t).doc(promo.promotionId).get());
  }
  if (!p) throw new UserError("Codice non valido.");
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.settings.timezone }).format(now);
  let applied: Bill | null = null;
  await db().runTransaction(async (tx) => {
    const pRef = refs.promotions(t).doc(p!.id);
    const bRef = refs.bills(t).doc(billId);
    const [ps, bs] = await Promise.all([tx.get(pRef), tx.get(bRef)]);
    const fresh = { id: ps.id, ...ps.data() } as Promotion;
    const b = { id: bs.id, ...bs.data() } as Bill;
    if (b.status !== "open") throw new UserError("Il conto è chiuso.");
    if ((b.promoIds ?? []).includes(fresh.id)) throw new UserError("Promozione già applicata.");
    const subtotal = computeBill(billInput(b)).totalCents;
    const check = checkPromotion(fresh, { date, clock: localClock(now, tenant.settings.timezone), subtotalCents: subtotal });
    if (!check.ok) throw new UserError(check.reason);
    const adjustments = [...b.adjustments, { id: randomToken(6), kind: "discount" as const, mode: fresh.mode, value: fresh.value, reason: fresh.code ? `Codice ${fresh.code}` : fresh.name }];
    const next = { ...b, adjustments, promoIds: [...(b.promoIds ?? []), fresh.id] };
    next.totals = computeBill(billInput(next));
    tx.update(bRef, { adjustments, promoIds: next.promoIds, totals: next.totals, updatedAt: nowIso() });
    tx.update(pRef, { uses: FieldValue.increment(1) });
    applied = next;
  });
  return applied!;
}

export async function getBill(tenantId: string, billId: string) {
  return withId<Bill>(await refs.bills(tenantId).doc(billId).get());
}
