import "server-only";
import { refs, db, nowIso, allWithId } from "@/server/db";
import { UserError } from "@/server/action";
import { randomToken } from "@/server/crypto";
import { notify } from "@/server/notify";
import { sendEmail } from "@/server/notifications/email";
import { availableSlots, DEFAULT_RESERVATIONS, type Reservation, type ReservationConfig } from "@/domain/reservations";
import { normalizePhone } from "@/domain/loyalty";
import { localClock } from "@/domain/menu";
import type { Tenant } from "@/server/db/types";

export function reservationConfig(t: Tenant): ReservationConfig {
  return { ...DEFAULT_RESERVATIONS, ...(t.settings.reservations ?? {}) };
}

export function venueNow(t: Tenant) {
  const now = new Date();
  return { date: new Intl.DateTimeFormat("en-CA", { timeZone: t.settings.timezone }).format(now), time: localClock(now, t.settings.timezone).time };
}

export function closedDates(t: Tenant, date: string): string[] {
  return (t.settings.closures ?? []).some((c) => c.from <= date && date <= c.to) ? [date] : [];
}

export async function reservationsOn(tenantId: string, date: string): Promise<Reservation[]> {
  return refs.reservations(tenantId).where("date", "==", date).get().then(allWithId<Reservation>);
}

export async function slotsFor(t: Tenant, date: string, party: number) {
  return availableSlots(reservationConfig(t), await reservationsOn(t.id, date), date, party, venueNow(t), closedDates(t, date));
}

export type ReservationInput = {
  name: string;
  phone: string;
  email?: string | null;
  covers: number;
  date: string;
  time: string;
  notes?: string;
  tableId?: string | null;
  reviewConsent?: boolean;
};

export async function createReservation(t: Tenant, input: ReservationInput, source: Reservation["source"], opts: { checkAvailability: boolean }) {
  const name = input.name.trim().slice(0, 80);
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  if (!name || phone.length < 8) throw new UserError("Inserisci nome e numero di telefono.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email non valida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new UserError("Data o ora non valida.");
  const covers = Math.floor(input.covers);
  if (!(covers >= 1 && covers <= 99)) throw new UserError("Numero di persone non valido.");
  const cfg = reservationConfig(t);
  const ref = refs.reservations(t.id).doc();
  await db().runTransaction(async (tx) => {
    if (opts.checkAvailability) {
      const existing = (await tx.get(refs.reservations(t.id).where("date", "==", input.date))).docs.map((d) => d.data() as Reservation);
      const slots = availableSlots(cfg, existing, input.date, covers, venueNow(t), closedDates(t, input.date));
      if (!slots.some((s) => s.time === input.time)) throw new UserError("L'orario scelto non è più disponibile. Scegline un altro.");
    }
    tx.create(ref, {
      name, phone, email, covers, date: input.date, time: input.time,
      durationMin: cfg.durationMin, notes: (input.notes ?? "").slice(0, 300), tableId: input.tableId ?? null,
      status: source === "online" && !cfg.autoConfirm ? "pending" : "confirmed",
      source, customerId: null, manageCode: randomToken(12), reviewConsent: !!input.reviewConsent, createdAt: nowIso(),
    });
  });
  if (source === "online") {
    await notify(t.id, { type: "message", title: `Nuova prenotazione online: ${name}, ${covers} pers.`, body: `${formatDay(input.date)} alle ${input.time}`, urgent: true });
  }
  if (email) await sendReservationEmail(t, { name, email, covers, date: input.date, time: input.time, status: source === "online" && !cfg.autoConfirm ? "pending" : "confirmed" });
  return ref.id;
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export async function sendReservationEmail(t: Tenant, r: { name: string; email: string; covers: number; date: string; time: string; status: string }) {
  const what = r.status === "confirmed" ? "è confermata" : r.status === "cancelled" ? "è stata annullata" : "è stata ricevuta ed è in attesa di conferma";
  await sendEmail({
    to: r.email,
    subject: `${t.displayName} · Prenotazione ${formatDay(r.date)} ore ${r.time}`,
    text:
      `Ciao ${r.name},\n\nla tua prenotazione da ${t.displayName} per ${r.covers} persone, ${formatDay(r.date)} alle ${r.time}, ${what}.\n\n` +
      `${t.address ? `Indirizzo: ${[t.address, t.city].filter(Boolean).join(", ")}\n` : ""}${t.phone ? `Per modifiche chiamaci: ${t.phone}\n` : ""}\nA presto!`,
  });
}

/** Click-to-chat WhatsApp link (no API needed) with a prefilled message. */
export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
