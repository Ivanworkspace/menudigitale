import "server-only";
import { refs, nowIso, allWithId, withId } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { sendEmail } from "@/server/notifications/email";
import { publicEnv } from "@/lib/env";
import { shiftDay } from "@/domain/push";
import {
  contactStrings,
  DEFAULT_REVIEWS,
  inCooldown,
  isValidReviewUrl,
  renderReviewMessage,
  type ReviewConfig,
  type ReviewRequest,
  type ReviewSource,
} from "@/domain/reviews";
import type { Tenant } from "@/server/db/types";

export function reviewConfig(t: Tenant): ReviewConfig {
  return { ...DEFAULT_REVIEWS, ...(t.settings.reviews ?? {}) };
}

/** Review requests are active only with a valid public review link. */
export function reviewsActive(t: Tenant): boolean {
  return reviewConfig(t).enabled && isValidReviewUrl(t.settings.reviewUrl);
}

export function reviewLink(t: Tenant, requestId: string) {
  return `${publicEnv.appUrl}/m/${t.slug}/recensione/${requestId}`;
}

export function reviewMessage(t: Tenant, r: Pick<ReviewRequest, "id" | "name">) {
  return renderReviewMessage(reviewConfig(t).message, { name: r.name, venue: t.displayName, link: reviewLink(t, r.id) });
}

/**
 * Queues a review request for the day after the visit, if the venue enabled
 * it for this source and the customer opted in. Idempotent per source.
 */
export async function enqueueReviewRequest(
  t: Tenant,
  input: { source: ReviewSource; sourceId: string; name: string; email?: string | null; phone?: string | null; visitDay: string; consent: boolean },
) {
  const cfg = reviewConfig(t);
  if (!reviewsActive(t) || !input.consent) return;
  if (input.source === "reservation" && !cfg.fromReservations) return;
  if (input.source === "takeaway" && !cfg.fromTakeaway) return;
  const ref = refs.reviewRequests(t.id).doc(`${input.source}-${input.sourceId}`);
  if ((await ref.get()).exists) return;

  const keys = contactStrings(input).map((c) => sha256(c));
  if (!keys.length) return;
  const base = {
    source: input.source,
    sourceId: input.sourceId,
    name: input.name.trim().slice(0, 80),
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone || null,
    contactKeys: keys,
    visitDay: input.visitDay,
    sendOn: shiftDay(input.visitDay, 1),
    createdAt: nowIso(),
    sentAt: null,
    clickedAt: null,
  };

  const [optouts, previous] = await Promise.all([
    Promise.all(keys.map((k) => refs.reviewOptouts(t.id).doc(k).get())),
    refs.reviewRequests(t.id).where("contactKeys", "array-contains-any", keys).get(),
  ]);
  const skip = optouts.some((o) => o.exists)
    ? "Il cliente ha chiesto di non ricevere questi messaggi"
    : inCooldown(previous.docs.filter((d) => d.get("status") !== "skipped").map((d) => d.get("createdAt") as string), cfg.cooldownDays, new Date())
      ? `Già invitato negli ultimi ${cfg.cooldownDays} giorni`
      : null;

  await ref.set({
    ...base,
    status: skip ? "skipped" : base.email ? "queued" : "to_send",
    channel: skip ? null : base.email ? "email" : "whatsapp",
    skipReason: skip,
  } satisfies Omit<ReviewRequest, "id">);
}

/** Morning job: emails the requests due today or earlier. */
export async function sendDueReviewEmails(t: Tenant, today: string): Promise<number> {
  if (!reviewsActive(t)) return 0;
  const due = allWithId<ReviewRequest>(await refs.reviewRequests(t.id).where("status", "==", "queued").get()).filter((r) => r.sendOn <= today);
  let sent = 0;
  for (const r of due) {
    // Too old (e.g. the job did not run for days): do not send late invites.
    if (r.sendOn < shiftDay(today, -3)) {
      await refs.reviewRequests(t.id).doc(r.id).update({ status: "skipped", skipReason: "Scaduta" });
      continue;
    }
    await sendEmail({
      to: r.email!,
      subject: `Com'è andata da ${t.displayName}?`,
      text: `${reviewMessage(t, r)}\n\n—\nNon vuoi ricevere altri inviti di questo tipo? Apri: ${reviewLink(t, r.id)}?stop=1`,
    });
    await refs.reviewRequests(t.id).doc(r.id).update({ status: "sent", sentAt: nowIso() });
    sent++;
  }
  return sent;
}

/** Public link: records the click and returns where to redirect. */
export async function openReviewLink(t: Tenant, requestId: string, stop: boolean): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{5,80}$/.test(requestId)) return null;
  const r = withId<ReviewRequest>(await refs.reviewRequests(t.id).doc(requestId).get());
  if (!r) return null;
  if (stop) {
    await Promise.all(r.contactKeys.map((k) => refs.reviewOptouts(t.id).doc(k).set({ createdAt: nowIso() })));
    return null;
  }
  if (!r.clickedAt) await refs.reviewRequests(t.id).doc(requestId).update({ status: "clicked", clickedAt: nowIso() });
  return t.settings.reviewUrl;
}
