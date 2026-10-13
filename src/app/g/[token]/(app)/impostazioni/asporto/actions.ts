"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refs, nowIso } from "@/server/db";
import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido.");
const schema = z.object({
  enabled: z.boolean(),
  windows: z.array(z.object({ weekdays: z.array(z.number().int().min(1).max(7)), from: time, to: time })).max(10),
  slotMinutes: z.number().int().min(5, "Intervallo minimo 5 minuti.").max(120),
  leadMinutes: z.number().int().min(0).max(24 * 60),
  maxOrdersPerSlot: z.number().int().min(1, "Almeno 1 ordine per fascia.").max(100),
  manualAccept: z.boolean(),
  minOrderCents: z.number().int().min(0).max(100_000),
  menuId: z.string().max(64).nullable(),
  note: z.string().max(300),
});

export async function saveTakeawaySettings(token: string, v: unknown) {
  return staffAction(token, { module: "takeaway", permission: "settings.manage" }, async (ctx) => {
    const r = schema.safeParse(v);
    if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Dati non validi.");
    if (r.data.windows.some((w) => w.to < w.from)) throw new UserError("In ogni fascia l'orario di fine deve essere dopo l'inizio.");
    await refs.tenant(ctx.tenant.id).update({ "settings.takeaway": r.data, updatedAt: nowIso() });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "settings.takeaway_updated");
    revalidatePath(`${ctx.basePath}/asporto`);
  });
}
