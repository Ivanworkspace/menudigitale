"use server";

import { z } from "zod";
import { staffAction, UserError } from "@/server/action";
import { deletePushSubscription, pushConfigured, savePushSubscription, sendOne, subscriptionId } from "@/server/push";
import { refs } from "@/server/db";
import { PUSH_TOPIC_KEYS, type PushTopic } from "@/domain/push";
import { userAgent } from "@/server/request";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

function deviceName(ua: string) {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Dispositivo";
}

export async function subscribePush(token: string, sub: unknown, topics: PushTopic[]) {
  return staffAction(token, { permission: "revenue.view" }, async (ctx) => {
    if (!pushConfigured()) throw new UserError("Le notifiche push non sono ancora configurate sul server. Contatta l'assistenza.");
    const s = subSchema.safeParse(sub);
    if (!s.success) throw new UserError("Iscrizione non valida.");
    await savePushSubscription({
      tenantId: ctx.tenant.id,
      staffId: ctx.staff.id,
      staffName: ctx.staff.displayName,
      endpoint: s.data.endpoint,
      keys: s.data.keys,
      topics: topics.filter((t) => PUSH_TOPIC_KEYS.includes(t)),
      device: deviceName(await userAgent()),
    });
  });
}

export async function updatePushTopics(token: string, endpoint: string, topics: PushTopic[]) {
  return staffAction(token, { permission: "revenue.view" }, async (ctx) => {
    const ref = refs.pushSubscriptions().doc(subscriptionId(endpoint));
    const snap = await ref.get();
    if (!snap.exists || snap.get("tenantId") !== ctx.tenant.id) throw new UserError("Questo dispositivo non è iscritto.");
    await ref.update({ topics: topics.filter((t) => PUSH_TOPIC_KEYS.includes(t)) });
  });
}

export async function unsubscribePush(token: string, endpoint: string) {
  return staffAction(token, { permission: "revenue.view" }, async (ctx) => {
    await deletePushSubscription(ctx.tenant.id, endpoint);
  });
}

export async function testPush(token: string, endpoint: string) {
  return staffAction(token, { permission: "revenue.view" }, async (ctx) => {
    const snap = await refs.pushSubscriptions().doc(subscriptionId(endpoint)).get();
    if (!snap.exists || snap.get("tenantId") !== ctx.tenant.id) throw new UserError("Questo dispositivo non è iscritto.");
    await sendOne({ id: snap.id, ...(snap.data() as Omit<Parameters<typeof sendOne>[0], "id">) }, { title: `${ctx.tenant.displayName}`, body: "Notifiche attive su questo dispositivo ✅", tag: "test" });
  });
}

export async function pushStatus(token: string, endpoint: string | null) {
  return staffAction(token, { permission: "revenue.view" }, async (ctx) => {
    if (!endpoint) return { subscribed: false, topics: [] as PushTopic[] };
    const snap = await refs.pushSubscriptions().doc(subscriptionId(endpoint)).get();
    const mine = snap.exists && snap.get("tenantId") === ctx.tenant.id;
    return { subscribed: mine, topics: mine ? (snap.get("topics") as PushTopic[]) : [] };
  });
}
