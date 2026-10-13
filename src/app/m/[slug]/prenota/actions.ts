"use server";

import { resolveTenantBySlug, tenantSubscription } from "@/server/tenancy/resolve";
import { createReservation, reservationConfig, slotsFor } from "@/server/reservations";
import { checkLockout, recordAttempt } from "@/server/auth/rate-limit";
import { clientIp } from "@/server/request";
import { UserError } from "@/server/action";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function venue(slug: string) {
  const t = await resolveTenantBySlug(slug);
  if (!t || !tenantSubscription(t).accessAllowed || !t.modules.reservations || !reservationConfig(t).onlineEnabled) {
    throw new UserError("Prenotazione online non disponibile.");
  }
  return t;
}

export async function publicSlots(slug: string, date: string, party: number): Promise<Result<{ time: string }[]>> {
  try {
    const t = await venue(slug);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Data non valida.");
    return { ok: true, data: (await slotsFor(t, date, Math.floor(party))).map((s) => ({ time: s.time })) };
  } catch (e) {
    return { ok: false, error: e instanceof UserError ? e.message : "Errore, riprova." };
  }
}

export async function publicBook(
  slug: string,
  v: { name: string; phone: string; email: string; covers: number; date: string; time: string; notes: string; privacy: boolean; website?: string; reviewConsent?: boolean },
): Promise<Result<{ status: string }>> {
  try {
    if (v.website) throw new UserError("Richiesta non valida."); // honeypot against bots
    if (!v.privacy) throw new UserError("Accetta l'informativa privacy per prenotare.");
    const t = await venue(slug);
    const ip = await clientIp();
    const policy = { maxFailures: 5, windowMs: 3600_000, lockMs: 3600_000 };
    const lock = await checkLockout("booking", `${t.id}:${ip}`, policy);
    if (lock.locked) throw new UserError("Troppe prenotazioni da questo dispositivo. Chiamaci per prenotare.");
    await createReservation(t, v, "online", { checkAvailability: true });
    // Count bookings per IP (as "failures") to cap abuse.
    await recordAttempt("booking", `${t.id}:${ip}`, false, t.id);
    return { ok: true, data: { status: reservationConfig(t).autoConfirm ? "confirmed" : "pending" } };
  } catch (e) {
    return { ok: false, error: e instanceof UserError ? e.message : "Errore, riprova." };
  }
}
