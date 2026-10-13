import "server-only";
import { refs, db, nowIso, allWithId, withId, expireIn } from "@/server/db";
import { UserError } from "@/server/action";
import { randomToken, sha256 } from "@/server/crypto";
import { loadMenuData } from "@/server/menu/repo";
import { approveOrder, buildItems, cancelItem, createOrder, type LineInput } from "@/server/orders/service";
import { closeSession, type Actor } from "@/server/sala/service";
import { venueNow } from "@/server/reservations";
import { orderTotal, type Order, type TableSession } from "@/domain/orders";
import {
  canMoveTakeaway,
  DEFAULT_TAKEAWAY,
  pickupSlots,
  takeawayLabel,
  takenSlots,
  type TakeawayConfig,
  type TakeawayInfo,
  type TakeawayStatus,
} from "@/domain/takeaway";
import { normalizePhone } from "@/domain/loyalty";
import { currentMenu, localClock, type Menu } from "@/domain/menu";
import type { Tenant } from "@/server/db/types";
import { getTenant } from "@/server/tenancy/resolve";
import { enqueueReviewRequest } from "@/server/reviews";

export type TakeawaySession = TableSession & { takeaway: TakeawayInfo };

export function takeawayConfig(t: Tenant): TakeawayConfig {
  return { ...DEFAULT_TAKEAWAY, ...(t.settings.takeaway ?? {}) };
}

/** Price list for takeaway: the configured one, else the one active now. */
export function takeawayMenuId(t: Tenant, menus: Menu[], now = new Date()): string | null {
  const cfg = takeawayConfig(t);
  const active = menus.filter((m) => m.active);
  if (cfg.menuId && active.some((m) => m.id === cfg.menuId)) return cfg.menuId;
  return currentMenu(menus, localClock(now, t.settings.timezone))?.id ?? null;
}

export function takeawayOpen(t: Tenant): boolean {
  return !!t.modules.takeaway && takeawayConfig(t).enabled;
}

export async function takeawayOn(tenantId: string, day: string): Promise<TakeawaySession[]> {
  const snap = await refs.tableSessions(tenantId).where("takeaway.day", "==", day).get();
  return allWithId<TakeawaySession>(snap);
}

function isClosedToday(t: Tenant, day: string) {
  return (t.settings.closures ?? []).some((c) => c.from <= day && day <= c.to);
}

export async function availablePickupSlots(t: Tenant) {
  const now = venueNow(t);
  const today = await takeawayOn(t.id, now.date);
  return pickupSlots(takeawayConfig(t), now, takenSlots(today.map((s) => s.takeaway)), isClosedToday(t, now.date));
}

export type TakeawayInput = {
  name: string;
  phone: string;
  pickupTime: string;
  lines: LineInput[];
  notes?: string;
  email?: string;
  reviewConsent?: boolean;
};

/**
 * Creates a takeaway order: a table-less session (so KDS, printing and the
 * till work unchanged) plus its order. Slot capacity and the daily number
 * are assigned in a transaction. Returns the customer's status token.
 */
export async function createTakeawayOrder(t: Tenant, input: TakeawayInput): Promise<{ token: string; number: number }> {
  if (!takeawayOpen(t)) throw new UserError("Gli ordini d'asporto non sono attivi.");
  const cfg = takeawayConfig(t);
  const name = String(input.name ?? "").trim().slice(0, 60);
  const phone = normalizePhone(String(input.phone ?? ""));
  if (name.length < 2) throw new UserError("Indica il tuo nome.");
  if (!phone || phone.replace(/\D/g, "").length < 8) throw new UserError("Indica un numero di telefono valido.");
  if (!/^\d{2}:\d{2}$/.test(input.pickupTime)) throw new UserError("Scegli l'orario di ritiro.");
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 120) || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email non valida.");

  // Validate products and prices before reserving anything.
  const data = await loadMenuData(t.id);
  const menuId = takeawayMenuId(t, data.menus);
  const items = buildItems(data, { menuId, currentCourse: 1, mode: "table_orders" }, input.lines, { forStaff: false });
  const total = orderTotal(items);
  if (total < cfg.minOrderCents) throw new UserError(`L'ordine minimo per l'asporto è di ${(cfg.minOrderCents / 100).toFixed(2).replace(".", ",")} €.`);

  const now = venueNow(t);
  const token = randomToken(24);
  const tokenHash = sha256(token);
  const sRef = refs.tableSessions(t.id).doc();
  let number = 0;

  await db().runTransaction(async (tx) => {
    const counterRef = refs.counters(t.id).doc(`takeaway-${now.date}`);
    const [counter, todaySnap] = await Promise.all([
      tx.get(counterRef),
      tx.get(refs.tableSessions(t.id).where("takeaway.day", "==", now.date)),
    ]);
    const taken = takenSlots(todaySnap.docs.map((d) => d.get("takeaway") as TakeawayInfo));
    const slots = pickupSlots(cfg, now, taken, isClosedToday(t, now.date));
    if (!slots.some((s) => s.time === input.pickupTime)) throw new UserError("L'orario scelto non è più disponibile: scegline un altro.");
    number = ((counter.get("value") as number | undefined) ?? 0) + 1;
    tx.set(counterRef, { value: number }, { merge: true });
    const info: TakeawayInfo = {
      number,
      day: now.date,
      pickupTime: input.pickupTime,
      customerName: name,
      phone,
      status: cfg.manualAccept ? "pending" : "accepted",
      tokenHash,
      acceptedAt: cfg.manualAccept ? null : nowIso(),
      readyAt: null,
      pickedUpAt: null,
      rejectReason: null,
      email,
      reviewConsent: !!input.reviewConsent,
    };
    const session: Omit<TableSession, "id"> = {
      tableId: "",
      tableIds: [],
      tableLabel: takeawayLabel(number, name),
      status: "open",
      mode: "table_orders",
      menuId,
      covers: 0,
      coversChildren: 0,
      waiterId: null,
      waiterName: null,
      openedAt: nowIso(),
      openedBy: null,
      closedAt: null,
      accessCode: null,
      firstOrderApproved: true,
      ordersCount: 0,
      lastOrderAt: null,
      currentCourse: 1,
      totalCents: 0,
      ayce: null,
      takeaway: info,
    };
    tx.create(sRef, session);
    tx.set(refs.takeawayTokens().doc(tokenHash), { tenantId: t.id, sessionId: sRef.id, expireAt: expireIn(3 * 86_400_000) });
  });

  try {
    await createOrder(t, sRef.id, input.lines, {
      source: "takeaway",
      actor: { id: null, name: name },
      notes: [`Ritiro ore ${input.pickupTime}`, `Tel. ${phone}`, String(input.notes ?? "").trim()].filter(Boolean).join(" · "),
      needsApproval: cfg.manualAccept,
      approvalReason: "takeaway",
      data,
    });
  } catch (e) {
    // Roll back the empty session so the slot is freed.
    await Promise.all([sRef.delete(), refs.takeawayTokens().doc(tokenHash).delete()]);
    throw e;
  }
  return { token, number };
}

/** Public status page lookup by the customer's token. */
export async function takeawayByToken(token: string): Promise<{ tenantId: string; session: TakeawaySession; orders: Order[] } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const ref = await refs.takeawayTokens().doc(sha256(token)).get();
  if (!ref.exists) return null;
  const tenantId = ref.get("tenantId") as string;
  const session = withId<TakeawaySession>(await refs.tableSessions(tenantId).doc(ref.get("sessionId") as string).get());
  if (!session?.takeaway) return null;
  const orders = allWithId<Order>(await refs.orders(tenantId).where("tableSessionId", "==", session.id).get());
  return { tenantId, session, orders };
}

async function getTakeaway(tenantId: string, sessionId: string): Promise<TakeawaySession> {
  const s = withId<TakeawaySession>(await refs.tableSessions(tenantId).doc(sessionId).get());
  if (!s?.takeaway) throw new UserError("Ordine d'asporto non trovato.");
  return s;
}

/** Staff moves a takeaway order forward (accept, reject, ready, picked up). */
export async function setTakeawayStatus(t: Tenant, sessionId: string, to: TakeawayStatus, actor: Actor, reason?: string) {
  const s = await getTakeaway(t.id, sessionId);
  const from = s.takeaway.status;
  if (!canMoveTakeaway(from, to)) throw new UserError("Operazione non consentita per lo stato attuale dell'ordine.");
  const orders = allWithId<Order>(await refs.orders(t.id).where("tableSessionId", "==", sessionId).get());
  const patch: Record<string, unknown> = { "takeaway.status": to };

  if (to === "accepted" && from === "pending") {
    for (const o of orders.filter((o) => o.status === "pending_approval")) await approveOrder(t.id, o.id, actor, true);
    patch["takeaway.acceptedAt"] = nowIso();
  }
  if (to === "rejected") {
    for (const o of orders) {
      if (o.status === "pending_approval") await approveOrder(t.id, o.id, actor, false);
      else if (o.status === "sent") {
        // Cancel dish by dish: prints the cancellation in the kitchen and restocks.
        const why = String(reason ?? "").trim().length >= 3 ? String(reason).trim() : "Asporto annullato";
        for (const i of o.items.filter((x) => x.status !== "cancelled")) await cancelItem(t.id, o.id, i.id, why, actor);
      }
    }
    patch["takeaway.rejectReason"] = String(reason ?? "").trim().slice(0, 200) || null;
    patch.totalCents = 0;
  }
  if (to === "ready") patch["takeaway.readyAt"] = nowIso();
  if (to === "picked_up") patch["takeaway.pickedUpAt"] = nowIso();
  await refs.tableSessions(t.id).doc(sessionId).update(patch);
  if (to === "rejected" || to === "picked_up") await closeSession(t, sessionId);
}

/** Called by the KDS when every dish of an order is ready. */
export async function markTakeawayReady(tenantId: string, sessionId: string) {
  if (!sessionId) return;
  const ref = refs.tableSessions(tenantId).doc(sessionId);
  await db().runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as TableSession | undefined;
    if (s?.takeaway?.status === "accepted") tx.update(ref, { "takeaway.status": "ready", "takeaway.readyAt": nowIso() });
  });
}

/** Marks the takeaway as collected when its bill is closed at the till. */
export async function onTakeawayBillClosed(tenantId: string, sessionId: string) {
  const ref = refs.tableSessions(tenantId).doc(sessionId);
  const s = (await ref.get()).data() as TableSession | undefined;
  if (s?.takeaway && s.takeaway.status !== "picked_up" && s.takeaway.status !== "rejected") {
    await ref.update({ "takeaway.status": "picked_up", "takeaway.pickedUpAt": nowIso() });
    const tenant = await getTenant(tenantId);
    const tk = s.takeaway;
    if (tenant) {
      await enqueueReviewRequest(tenant, {
        source: "takeaway", sourceId: sessionId, name: tk.customerName, email: tk.email ?? null, phone: tk.phone, visitDay: tk.day, consent: !!tk.reviewConsent,
      });
    }
  }
}
