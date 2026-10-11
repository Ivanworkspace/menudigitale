import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { refs, db, nowIso, withId, allWithId } from "@/server/db";
import { randomToken } from "@/server/crypto";
import { UserError } from "@/server/action";
import { currentMenuMode, newAccessCode, type Table, type TableSession } from "@/domain/orders";
import { currentMenu, localClock, type Menu } from "@/domain/menu";
import { DEFAULT_AYCE, ayceSlot } from "@/domain/ayce";
import type { Tenant } from "@/server/db/types";

export type Actor = { id: string | null; name: string | null };

export function nowMode(tenant: Tenant, now = new Date()) {
  const clock = localClock(now, tenant.settings.timezone);
  const mode = currentMenuMode(tenant.defaultMenuMode, tenant.settings.modeSchedules, clock);
  // Ordering modes need the Orders module.
  return tenant.modules.orders ? mode : "static";
}

export async function getTable(tenantId: string, tableId: string): Promise<Table> {
  const t = withId<Table>(await refs.tables(tenantId).doc(tableId).get());
  if (!t) throw new UserError("Tavolo non trovato.");
  return t;
}

export async function getSession(tenantId: string, sessionId: string): Promise<TableSession> {
  const s = withId<TableSession>(await refs.tableSessions(tenantId).doc(sessionId).get());
  if (!s) throw new UserError("Sessione del tavolo non trovata.");
  return s;
}

async function assertTableLimit(tenant: Tenant) {
  if (!tenant.planId) return;
  const max = (await refs.plans().doc(tenant.planId).get()).get("maxTables") as number | null | undefined;
  if (max == null) return;
  const count = (await refs.tables(tenant.id).count().get()).data().count;
  if (count >= max) throw new UserError(`Il tuo piano consente al massimo ${max} tavoli.`);
}

// ---------------------------------------------------------------------------
// Tables & rooms
// ---------------------------------------------------------------------------

export async function createTable(tenant: Tenant, input: { roomId: string; label: string; seats: number; shape: Table["shape"]; x?: number; y?: number }) {
  await assertTableLimit(tenant);
  const t = tenant.id;
  if (!(await refs.rooms(t).doc(input.roomId).get()).exists) throw new UserError("Sala non trovata.");
  const dup = await refs.tables(t).where("label", "==", input.label).limit(1).get();
  if (!dup.empty) throw new UserError(`Esiste già un tavolo "${input.label}".`);
  const ref = refs.tables(t).doc();
  const qrToken = randomToken(18);
  const inRoom = (await refs.tables(t).where("roomId", "==", input.roomId).get()).docs.map((d) => d.data() as Table);
  const count = inRoom.length;
  // First free spot on a 130px grid, so a new table never lands on another one.
  const w = input.shape === "rect" ? 160 : 100;
  const free = (x: number, y: number) => inRoom.every((o) => x + w + 20 <= o.x || o.x + o.w + 20 <= x || y + 120 <= o.y || o.y + o.h + 20 <= y);
  let spot = { x: 20, y: 20 };
  search: for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 7; col++) {
      if (free(20 + col * 130, 20 + row * 130)) {
        spot = { x: 20 + col * 130, y: 20 + row * 130 };
        break search;
      }
    }
  }
  const batch = db().batch();
  batch.set(ref, {
    roomId: input.roomId,
    label: input.label,
    seats: input.seats,
    shape: input.shape,
    x: input.x ?? spot.x,
    y: input.y ?? spot.y,
    w,
    h: 100,
    qrToken,
    active: true,
    status: "free",
    currentSessionId: null,
    mergedInto: null,
    sort: count,
  });
  batch.set(refs.tableTokens().doc(qrToken), { tenantId: t, tableId: ref.id });
  await batch.commit();
  return ref.id;
}

export async function regenerateQr(tenantId: string, tableId: string) {
  const table = await getTable(tenantId, tableId);
  const qrToken = randomToken(18);
  const batch = db().batch();
  batch.delete(refs.tableTokens().doc(table.qrToken));
  batch.set(refs.tableTokens().doc(qrToken), { tenantId, tableId });
  batch.update(refs.tables(tenantId).doc(tableId), { qrToken });
  await batch.commit();
  return qrToken;
}

export async function deleteTable(tenantId: string, tableId: string) {
  const table = await getTable(tenantId, tableId);
  if (table.currentSessionId) throw new UserError("Il tavolo è aperto: chiudilo prima di eliminarlo.");
  const batch = db().batch();
  batch.delete(refs.tableTokens().doc(table.qrToken));
  batch.delete(refs.tables(tenantId).doc(tableId));
  await batch.commit();
}

/** Lookup by QR token (public). */
export async function resolveTableToken(token: string): Promise<{ tenantId: string; tableId: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const snap = await refs.tableTokens().doc(token).get();
  return snap.exists ? { tenantId: snap.get("tenantId"), tableId: snap.get("tableId") } : null;
}

// ---------------------------------------------------------------------------
// Sessions (open / close / move / merge / split)
// ---------------------------------------------------------------------------

export async function openSession(
  tenant: Tenant,
  tableId: string,
  input: { covers: number; coversChildren: number; waiterId: string | null; waiterName: string | null },
  actor: Actor,
  menus?: Menu[],
): Promise<string> {
  const t = tenant.id;
  const now = new Date();
  const mode = nowMode(tenant, now);
  const clock = localClock(now, tenant.settings.timezone);
  const menuList = menus ?? allWithId<Menu>(await refs.menus(t).get());
  const menu = currentMenu(menuList, clock);
  const cfg = tenant.settings.ayce ?? DEFAULT_AYCE;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.settings.timezone }).format(now);
  const slot = ayceSlot(cfg, { ...clock, date });

  const sessionRef = refs.tableSessions(t).doc();
  await db().runTransaction(async (tx) => {
    const tableRef = refs.tables(t).doc(tableId);
    const table = (await tx.get(tableRef)).data() as Table | undefined;
    if (!table || !table.active) throw new UserError("Tavolo non trovato.");
    if (table.currentSessionId) throw new UserError(`Il tavolo ${table.label} è già aperto.`);
    const session: Omit<TableSession, "id"> = {
      tableId,
      tableIds: [tableId],
      tableLabel: table.label,
      status: "open",
      mode,
      menuId: menu?.id ?? null,
      covers: Math.max(0, input.covers),
      coversChildren: Math.max(0, input.coversChildren),
      waiterId: input.waiterId,
      waiterName: input.waiterName,
      openedAt: now.toISOString(),
      openedBy: actor.id,
      closedAt: null,
      accessCode: tenant.settings.orderProtection.tableCode ? newAccessCode() : null,
      firstOrderApproved: false,
      ordersCount: 0,
      lastOrderAt: null,
      currentCourse: 1,
      totalCents: 0,
      ayce:
        mode === "ayce"
          ? { slot, adultCents: cfg.prices[slot].adultCents, childCents: cfg.prices[slot].childCents, lastRoundAt: null, rounds: 0, includedQtyByProduct: {} }
          : null,
    };
    tx.create(sessionRef, session);
    tx.update(tableRef, { currentSessionId: sessionRef.id, status: "occupied", mergedInto: null });
  });
  return sessionRef.id;
}

function freeTables(tx: Transaction, tenantId: string, tableIds: string[], status: "free" | "to_clean") {
  for (const id of tableIds) {
    tx.update(refs.tables(tenantId).doc(id), { currentSessionId: null, mergedInto: null, status });
  }
}

export async function closeSession(tenant: Tenant, sessionId: string) {
  const t = tenant.id;
  const openRequests = await refs.serviceRequests(t).where("tableSessionId", "==", sessionId).where("status", "==", "open").get();
  await db().runTransaction(async (tx) => {
    const ref = refs.tableSessions(t).doc(sessionId);
    const s = (await tx.get(ref)).data() as TableSession | undefined;
    if (!s) throw new UserError("Sessione non trovata.");
    if (s.status === "closed") return;
    tx.update(ref, { status: "closed", closedAt: nowIso() });
    freeTables(tx, t, s.tableIds, "to_clean");
    openRequests.docs.forEach((d) => tx.update(d.ref, { status: "done" }));
  });
}

export async function markClean(tenantId: string, tableId: string) {
  const table = await getTable(tenantId, tableId);
  if (table.currentSessionId) throw new UserError("Il tavolo è aperto.");
  await refs.tables(tenantId).doc(tableId).update({ status: "free" });
}

export async function moveSession(tenantId: string, sessionId: string, toTableId: string) {
  const openOrders = await refs.orders(tenantId).where("tableSessionId", "==", sessionId).get();
  await db().runTransaction(async (tx) => {
    const sRef = refs.tableSessions(tenantId).doc(sessionId);
    const toRef = refs.tables(tenantId).doc(toTableId);
    const [sSnap, toSnap] = await Promise.all([tx.get(sRef), tx.get(toRef)]);
    const s = sSnap.data() as TableSession | undefined;
    const to = toSnap.data() as Table | undefined;
    if (!s || s.status === "closed") throw new UserError("Sessione non attiva.");
    if (!to || !to.active) throw new UserError("Tavolo di destinazione non trovato.");
    if (to.currentSessionId) throw new UserError(`Il tavolo ${to.label} è occupato.`);
    const from = s.tableId;
    const tableIds = s.tableIds.map((id) => (id === from ? toTableId : id));
    tx.update(sRef, { tableId: toTableId, tableIds, tableLabel: to.label });
    tx.update(toRef, { currentSessionId: sessionId, status: "occupied", mergedInto: null });
    tx.update(refs.tables(tenantId).doc(from), { currentSessionId: null, mergedInto: null, status: "to_clean" });
    openOrders.docs.forEach((d) => tx.update(d.ref, { tableId: toTableId, tableLabel: to.label }));
  });
}

/** Joins `sourceTableId` (and its open session, if any) into `targetSessionId`. */
export async function mergeTables(tenantId: string, targetSessionId: string, sourceTableId: string) {
  const sourceTable = await getTable(tenantId, sourceTableId);
  const sourceOrders = sourceTable.currentSessionId
    ? await refs.orders(tenantId).where("tableSessionId", "==", sourceTable.currentSessionId).get()
    : null;
  await db().runTransaction(async (tx) => {
    const tRef = refs.tableSessions(tenantId).doc(targetSessionId);
    const target = (await tx.get(tRef)).data() as TableSession | undefined;
    if (!target || target.status === "closed") throw new UserError("Sessione non attiva.");
    if (target.tableIds.includes(sourceTableId)) throw new UserError("Tavoli già uniti.");
    const srcRef = refs.tables(tenantId).doc(sourceTableId);
    const src = (await tx.get(srcRef)).data() as Table;
    let covers = target.covers;
    let children = target.coversChildren;
    let total = target.totalCents;
    if (src.currentSessionId) {
      const sRef = refs.tableSessions(tenantId).doc(src.currentSessionId);
      const s = (await tx.get(sRef)).data() as TableSession;
      if (s.tableIds.length > 1) throw new UserError("Separa prima i tavoli uniti a quello di origine.");
      covers += s.covers;
      children += s.coversChildren;
      total += s.totalCents;
      tx.update(sRef, { status: "closed", closedAt: nowIso(), mergedIntoSession: targetSessionId });
      sourceOrders?.docs.forEach((d) => tx.update(d.ref, { tableSessionId: targetSessionId, tableId: target.tableId, tableLabel: target.tableLabel }));
    }
    const labels = [target.tableLabel, src.label].join("+");
    tx.update(tRef, { tableIds: [...target.tableIds, sourceTableId], covers, coversChildren: children, totalCents: total, tableLabel: labels });
    tx.update(srcRef, { currentSessionId: targetSessionId, mergedInto: target.tableId, status: "occupied" });
  });
}

export async function splitTable(tenantId: string, sessionId: string, tableId: string) {
  await db().runTransaction(async (tx) => {
    const sRef = refs.tableSessions(tenantId).doc(sessionId);
    const s = (await tx.get(sRef)).data() as TableSession | undefined;
    if (!s || !s.tableIds.includes(tableId) || s.tableId === tableId) throw new UserError("Puoi separare solo un tavolo unito.");
    const rest = s.tableIds.filter((id) => id !== tableId);
    const labels = await Promise.all(rest.map(async (id) => ((await tx.get(refs.tables(tenantId).doc(id))).get("label") as string)));
    tx.update(sRef, { tableIds: rest, tableLabel: labels.join("+") });
    tx.update(refs.tables(tenantId).doc(tableId), { currentSessionId: null, mergedInto: null, status: "free" });
  });
}

export async function updateSession(
  tenantId: string,
  sessionId: string,
  patch: Partial<Pick<TableSession, "covers" | "coversChildren" | "waiterId" | "waiterName">>,
) {
  const s = await getSession(tenantId, sessionId);
  if (s.status === "closed") throw new UserError("Sessione chiusa.");
  await refs.tableSessions(tenantId).doc(sessionId).update(patch);
}

/** Recomputes the map colour of the session's tables. */
export async function refreshTableStatus(tenantId: string, sessionId: string) {
  const s = await getSession(tenantId, sessionId);
  if (s.status === "closed") return;
  const [pending, bill] = await Promise.all([
    refs.orders(tenantId).where("tableSessionId", "==", sessionId).where("status", "==", "pending_approval").limit(1).get(),
    refs.serviceRequests(tenantId).where("tableSessionId", "==", sessionId).where("type", "==", "request_bill").where("status", "==", "open").limit(1).get(),
  ]);
  const status = s.status === "bill_requested" || !bill.empty ? "bill_requested" : !pending.empty ? "pending" : "occupied";
  const batch = db().batch();
  s.tableIds.forEach((id) => batch.update(refs.tables(tenantId).doc(id), { status }));
  await batch.commit();
}
