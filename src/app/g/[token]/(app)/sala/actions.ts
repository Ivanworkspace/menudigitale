"use server";

import { z } from "zod";
import { refs, db, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import {
  closeSession,
  createTable,
  deleteTable,
  getSession,
  markClean,
  mergeTables,
  moveSession,
  openSession,
  refreshTableStatus,
  regenerateQr,
  splitTable,
  updateSession,
} from "@/server/sala/service";
import type { StaffContext } from "@/server/auth/staff-session";

const TABLES = { permission: "tables.manage" as const };
const LAYOUT = { permission: "settings.manage" as const };
const actor = (ctx: StaffContext) => ({ id: ctx.staff.id, name: ctx.staff.displayName });

function parse<T extends z.ZodTypeAny>(schema: T, v: unknown): z.infer<T> {
  const r = schema.safeParse(v);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
  return r.data;
}

// --- Rooms & tables layout ---------------------------------------------------

export async function saveRoom(token: string, v: { id?: string; name: string }) {
  return staffAction(token, LAYOUT, async (ctx) => {
    const name = v.name?.trim();
    if (!name || name.length > 40) throw new UserError("Nome sala non valido.");
    const col = refs.rooms(ctx.tenant.id);
    if (v.id) await col.doc(v.id).update({ name });
    else return { id: (await col.add({ name, sort: (await col.count().get()).data().count })).id };
    return { id: v.id };
  });
}

export async function deleteRoom(token: string, roomId: string) {
  return staffAction(token, LAYOUT, async (ctx) => {
    const t = await refs.tables(ctx.tenant.id).where("roomId", "==", roomId).limit(1).get();
    if (!t.empty) throw new UserError("Sposta o elimina prima i tavoli della sala.");
    await refs.rooms(ctx.tenant.id).doc(roomId).delete();
  });
}

const tableSchema = z.object({
  roomId: z.string().min(1),
  label: z.string().trim().min(1, "Inserisci il nome del tavolo").max(12),
  seats: z.number().int().min(1).max(40),
  shape: z.enum(["square", "round", "rect"]),
});

export async function addTable(token: string, v: unknown) {
  return staffAction(token, LAYOUT, async (ctx) => {
    const data = parse(tableSchema, v);
    const id = await createTable(ctx.tenant, data);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.created", { entity: "table", entityId: id, diff: { label: data.label } });
    return { id };
  });
}

export async function updateTable(token: string, tableId: string, v: unknown) {
  return staffAction(token, LAYOUT, async (ctx) => {
    const data = parse(tableSchema, v);
    const dup = await refs.tables(ctx.tenant.id).where("label", "==", data.label).get();
    if (dup.docs.some((d) => d.id !== tableId)) throw new UserError(`Esiste già un tavolo "${data.label}".`);
    await refs.tables(ctx.tenant.id).doc(tableId).update({ ...data, w: data.shape === "rect" ? 160 : 100 });
  });
}

export async function saveLayout(token: string, positions: { id: string; x: number; y: number }[]) {
  return staffAction(token, LAYOUT, async (ctx) => {
    if (positions.length > 300) throw new UserError("Troppi tavoli.");
    const batch = db().batch();
    for (const p of positions) {
      batch.update(refs.tables(ctx.tenant.id).doc(p.id), {
        x: Math.max(0, Math.min(2000, Math.round(p.x))),
        y: Math.max(0, Math.min(2000, Math.round(p.y))),
      });
    }
    await batch.commit();
  });
}

export async function removeTable(token: string, tableId: string) {
  return staffAction(token, LAYOUT, async (ctx) => {
    await deleteTable(ctx.tenant.id, tableId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.deleted", { entity: "table", entityId: tableId });
  });
}

export async function regenerateTableQr(token: string, tableId: string) {
  return staffAction(token, TABLES, async (ctx) => {
    await regenerateQr(ctx.tenant.id, tableId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.qr_regenerated", { entity: "table", entityId: tableId });
  });
}

// --- Service ------------------------------------------------------------------

export async function openTable(token: string, tableId: string, v: { covers: number; coversChildren: number; waiterId: string | null }) {
  return staffAction(token, TABLES, async (ctx) => {
    const covers = Math.floor(Number(v.covers));
    const children = Math.floor(Number(v.coversChildren ?? 0));
    if (!(covers >= 0 && covers <= 99 && children >= 0 && children <= 99)) throw new UserError("Numero di coperti non valido.");
    let waiterName: string | null = null;
    if (v.waiterId) {
      const w = await refs.staff(ctx.tenant.id).doc(v.waiterId).get();
      if (!w.exists) throw new UserError("Cameriere non trovato.");
      waiterName = w.get("displayName");
    }
    const sessionId = await openSession(ctx.tenant, tableId, { covers, coversChildren: children, waiterId: v.waiterId, waiterName }, actor(ctx));
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.opened", { entity: "table", entityId: tableId, diff: { covers, children } });
    return { sessionId };
  });
}

export async function editSession(token: string, sessionId: string, v: { covers: number; coversChildren: number; waiterId: string | null }) {
  return staffAction(token, TABLES, async (ctx) => {
    let waiterName: string | null = null;
    if (v.waiterId) waiterName = (await refs.staff(ctx.tenant.id).doc(v.waiterId).get()).get("displayName") ?? null;
    await updateSession(ctx.tenant.id, sessionId, {
      covers: Math.max(0, Math.floor(v.covers)),
      coversChildren: Math.max(0, Math.floor(v.coversChildren)),
      waiterId: v.waiterId,
      waiterName,
    });
  });
}

export async function closeTable(token: string, sessionId: string) {
  return staffAction(token, TABLES, async (ctx) => {
    const s = await getSession(ctx.tenant.id, sessionId);
    if (ctx.modules.billing && s.totalCents > 0) {
      // With the billing module the table is closed from the bill (Phase 5).
      const paid = (await refs.tenant(ctx.tenant.id).collection("bills").where("tableSessionId", "==", sessionId).where("status", "==", "paid").limit(1).get()).size;
      if (!paid && !ctx.permissions.has("bills.manage")) throw new UserError("Il conto non è ancora stato chiuso in cassa.");
    }
    await closeSession(ctx.tenant, sessionId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.closed", { entity: "table_session", entityId: sessionId, diff: { total: s.totalCents } });
  });
}

export async function cleanTable(token: string, tableId: string) {
  return staffAction(token, TABLES, async (ctx) => markClean(ctx.tenant.id, tableId));
}

export async function moveTable(token: string, sessionId: string, toTableId: string) {
  return staffAction(token, TABLES, async (ctx) => {
    await moveSession(ctx.tenant.id, sessionId, toTableId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.moved", { entity: "table_session", entityId: sessionId, diff: { to: toTableId } });
  });
}

export async function joinTables(token: string, sessionId: string, tableId: string) {
  return staffAction(token, TABLES, async (ctx) => {
    await mergeTables(ctx.tenant.id, sessionId, tableId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.merged", { entity: "table_session", entityId: sessionId, diff: { table: tableId } });
  });
}

export async function separateTable(token: string, sessionId: string, tableId: string) {
  return staffAction(token, TABLES, async (ctx) => {
    await splitTable(ctx.tenant.id, sessionId, tableId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "table.split", { entity: "table_session", entityId: sessionId, diff: { table: tableId } });
  });
}

export async function resolveRequest(token: string, requestId: string) {
  return staffAction(token, {}, async (ctx) => {
    const ref = refs.serviceRequests(ctx.tenant.id).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) throw new UserError("Richiesta non trovata.");
    await ref.update({ status: "done", handledBy: ctx.staff.displayName, handledAt: nowIso() });
    await refreshTableStatus(ctx.tenant.id, snap.get("tableSessionId")).catch(() => {});
  });
}
