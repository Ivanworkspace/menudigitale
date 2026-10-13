"use server";

import { resolveTenantBySlug, tenantSubscription } from "@/server/tenancy/resolve";
import { availablePickupSlots, createTakeawayOrder, takeawayOpen } from "@/server/takeaway";
import { checkLockout, recordAttempt } from "@/server/auth/rate-limit";
import { clientIp } from "@/server/request";
import { UserError } from "@/server/action";
import type { LineInput } from "@/server/orders/service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function venue(slug: string) {
  const t = await resolveTenantBySlug(slug);
  if (!t || !tenantSubscription(t).accessAllowed || !takeawayOpen(t)) throw new UserError("Gli ordini d'asporto non sono disponibili.");
  return t;
}

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UserError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Errore, riprova." };
}

export async function takeawaySlots(slug: string): Promise<Result<{ time: string; left: number }[]>> {
  try {
    return { ok: true, data: await availablePickupSlots(await venue(slug)) };
  } catch (e) {
    return fail(e);
  }
}

export async function placeTakeaway(
  slug: string,
  v: { name: string; phone: string; pickupTime: string; lines: LineInput[]; notes: string; privacy: boolean; website?: string; email?: string; reviewConsent?: boolean },
): Promise<Result<{ token: string; number: number }>> {
  try {
    if (v.website) throw new UserError("Richiesta non valida."); // honeypot against bots
    if (!v.privacy) throw new UserError("Accetta l'informativa privacy per ordinare.");
    const t = await venue(slug);
    const ip = await clientIp();
    const policy = { maxFailures: 4, windowMs: 3600_000, lockMs: 3600_000 };
    const key = `${t.id}:${ip}`;
    const lock = await checkLockout("takeaway", key, policy);
    if (lock.locked) throw new UserError("Troppi ordini da questo dispositivo. Chiamaci per ordinare.");
    const r = await createTakeawayOrder(t, v);
    // Count orders per IP (as "failures") to cap abuse.
    await recordAttempt("takeaway", key, false, t.id);
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}
