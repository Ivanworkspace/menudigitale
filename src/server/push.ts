import "server-only";
import webpush from "web-push";
import { refs, nowIso, allWithId } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { topicsForType, type PushTopic } from "@/domain/push";

export type PushSubscriptionDoc = {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  topics: PushTopic[];
  device: string;
  createdAt: string;
  lastSentAt: string | null;
};

let configured: boolean | null = null;

/** Web Push needs VAPID keys (see .env.example); without them push is off. */
export function pushConfigured(): boolean {
  if (configured === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    configured = !!pub && !!priv;
    if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:assistenza@example.com", pub!, priv!);
  }
  return configured;
}

export function subscriptionId(endpoint: string) {
  return sha256(endpoint);
}

export async function savePushSubscription(input: {
  tenantId: string;
  staffId: string;
  staffName: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  topics: PushTopic[];
  device: string;
}) {
  if (!/^https:\/\//.test(input.endpoint) || input.endpoint.length > 1000) throw new Error("invalid endpoint");
  await refs.pushSubscriptions().doc(subscriptionId(input.endpoint)).set({ ...input, createdAt: nowIso(), lastSentAt: null });
}

export async function deletePushSubscription(tenantId: string, endpoint: string) {
  const ref = refs.pushSubscriptions().doc(subscriptionId(endpoint));
  const snap = await ref.get();
  if (snap.exists && snap.get("tenantId") === tenantId) await ref.delete();
}

/** Sends a push to the venue's devices subscribed to any of `topics`. */
export async function pushToTopics(tenantId: string, topics: PushTopic[], msg: { title: string; body?: string; url?: string; tag?: string }) {
  if (!topics.length || !pushConfigured()) return;
  const snap = await refs.pushSubscriptions().where("tenantId", "==", tenantId).get();
  const subs = allWithId<PushSubscriptionDoc>(snap).filter((s) => s.topics.some((t) => topics.includes(t)));
  await Promise.all(subs.map((s) => sendOne(s, msg)));
}

export async function sendOne(s: PushSubscriptionDoc, msg: { title: string; body?: string; url?: string; tag?: string }) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 3600, urgency: "high" });
    await refs.pushSubscriptions().doc(s.id).update({ lastSentAt: nowIso() });
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    // The browser revoked the subscription (app uninstalled, permission removed).
    if (code === 404 || code === 410) await refs.pushSubscriptions().doc(s.id).delete();
    else console.error("push failed", code ?? e);
  }
}

/**
 * Mirrors a staff notification to subscribed phones. Never throws. The
 * notification carries no link: the device opens its own installed panel
 * (the secret panel URL never leaves the device).
 */
export async function pushForNotification(tenantId: string, n: { type: string; title: string; body?: string }) {
  try {
    const topics = topicsForType(n.type);
    if (!topics.length || !pushConfigured()) return;
    await pushToTopics(tenantId, topics, { title: n.title, body: n.body ?? "", tag: n.type });
  } catch (e) {
    console.error("push mirror failed", e);
  }
}
