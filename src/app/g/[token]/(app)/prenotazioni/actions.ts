"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso, withId } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { createReservation, sendReservationEmail, slotsFor, type ReservationInput } from "@/server/reservations";
import { openSession } from "@/server/sala/service";
import type { Reservation, ReservationStatus } from "@/domain/reservations";

const RES = { permission: "reservations.manage" as const, module: "reservations" as const };

export async function addReservation(token: string, input: ReservationInput) {
  return staffAction(token, RES, async (ctx) => {
    const id = await createReservation(ctx.tenant, input, "phone", { checkAvailability: false });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "reservation.created", { entity: "reservation", entityId: id, diff: { name: input.name, date: input.date, time: input.time } });
    revalidatePath(`${ctx.basePath}/prenotazioni`);
    return { id };
  });
}

export async function updateReservation(token: string, id: string, patch: Partial<Pick<Reservation, "name" | "phone" | "email" | "covers" | "date" | "time" | "notes" | "tableId">>) {
  return staffAction(token, RES, async (ctx) => {
    const ref = refs.reservations(ctx.tenant.id).doc(id);
    if (!(await ref.get()).exists) throw new UserError("Prenotazione non trovata.");
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await ref.update(clean);
    revalidatePath(`${ctx.basePath}/prenotazioni`);
  });
}

export async function setReservationStatus(token: string, id: string, status: ReservationStatus) {
  return staffAction(token, RES, async (ctx) => {
    const r = withId<Reservation>(await refs.reservations(ctx.tenant.id).doc(id).get());
    if (!r) throw new UserError("Prenotazione non trovata.");
    await refs.reservations(ctx.tenant.id).doc(id).update({ status, statusAt: nowIso() });
    // Arrival with an assigned free table opens it right away.
    if (status === "arrived" && r.tableId && ctx.permissions.has("tables.manage")) {
      const table = await refs.tables(ctx.tenant.id).doc(r.tableId).get();
      if (table.exists && !table.get("currentSessionId")) {
        await openSession(ctx.tenant, r.tableId, { covers: r.covers, coversChildren: 0, waiterId: null, waiterName: null }, { id: ctx.staff.id, name: ctx.staff.displayName });
      }
    }
    if ((status === "confirmed" || status === "cancelled") && r.email) await sendReservationEmail(ctx.tenant, { ...r, email: r.email, status });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), `reservation.${status}`, { entity: "reservation", entityId: id });
    revalidatePath(`${ctx.basePath}/prenotazioni`);
  });
}

export async function getSlots(token: string, date: string, party: number) {
  return staffAction(token, RES, async (ctx) => slotsFor(ctx.tenant, date, party));
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cfgSchema = z.object({
  onlineEnabled: z.boolean(),
  slots: z.array(z.object({ weekdays: z.array(z.number().int().min(1).max(7)), from: time, to: time, intervalMin: z.number().int().min(5).max(120) })).max(20),
  maxCoversPerSlot: z.number().int().min(1).max(1000),
  maxPartySize: z.number().int().min(1).max(100),
  leadTimeMin: z.number().int().min(0).max(10_080),
  maxDaysAhead: z.number().int().min(1).max(365),
  durationMin: z.number().int().min(15).max(600),
  autoConfirm: z.boolean(),
});

export async function saveReservationSettings(token: string, v: unknown) {
  return staffAction(token, { ...RES, permission: "settings.manage" }, async (ctx) => {
    const r = cfgSchema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    await refs.tenant(ctx.tenant.id).update({ "settings.reservations": r.data, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "settings.reservations_updated");
    revalidatePath(`${ctx.basePath}/prenotazioni`, "layout");
  });
}
