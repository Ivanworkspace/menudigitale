"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { isValidReviewUrl } from "@/domain/reviews";

const schema = z.object({
  enabled: z.boolean(),
  fromReservations: z.boolean(),
  fromTakeaway: z.boolean(),
  cooldownDays: z.number().int().min(7, "Almeno 7 giorni tra un invito e l'altro.").max(730),
  message: z.string().min(10, "Il messaggio è troppo corto.").max(600),
  reviewUrl: z.string().max(500),
});

export async function saveReviewSettings(token: string, v: unknown) {
  return staffAction(token, { permission: "settings.manage" }, async (ctx) => {
    const r = schema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    const { reviewUrl, ...cfg } = r.data;
    const url = reviewUrl.trim();
    if (url && !isValidReviewUrl(url)) throw new UserError("Il link alle recensioni deve iniziare con https://");
    if (cfg.enabled && !url) throw new UserError("Inserisci il link per lasciare una recensione su Google.");
    await refs.tenant(ctx.tenant.id).update({ "settings.reviews": cfg, "settings.reviewUrl": url || null, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "settings.reviews_updated");
    revalidatePath(`${ctx.basePath}/recensioni`);
  });
}

/** Staff opened WhatsApp with the prefilled invitation. */
export async function markReviewSent(token: string, id: string) {
  return staffAction(token, { permission: "customers.manage" }, async (ctx) => {
    const ref = refs.reviewRequests(ctx.tenant.id).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new UserError("Invito non trovato.");
    if (snap.get("status") === "to_send") await ref.update({ status: "sent", sentAt: nowIso(), channel: "whatsapp" });
    revalidatePath(`${ctx.basePath}/recensioni`);
  });
}

export async function skipReview(token: string, id: string) {
  return staffAction(token, { permission: "customers.manage" }, async (ctx) => {
    await refs.reviewRequests(ctx.tenant.id).doc(id).update({ status: "skipped", skipReason: `Saltato da ${ctx.staff.displayName}` });
    revalidatePath(`${ctx.basePath}/recensioni`);
  });
}
