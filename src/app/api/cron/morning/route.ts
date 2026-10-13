import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { refs, allWithId } from "@/server/db";
import { serverEnv } from "@/lib/env";
import { formatEuro } from "@/lib/format";
import { deltaLabel, shiftDay } from "@/domain/push";
import { dailyTotals, venueDay } from "@/server/owner";
import { pushConfigured, sendOne, type PushSubscriptionDoc } from "@/server/push";
import type { Tenant } from "@/server/db/types";
import { sendDueReviewEmails } from "@/server/reviews";
import { tenantSubscription } from "@/server/tenancy/resolve";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Daily (Vercel Cron, morning):
 * 1. emails the review invitations due today (customers who opted in);
 * 2. pushes yesterday's takings to owners subscribed to the "summary" topic.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reviews = await sendReviewInvites();
  if (!pushConfigured()) return NextResponse.json({ reviews, sent: 0, note: "push not configured" });
  const subs = allWithId<PushSubscriptionDoc>(await refs.pushSubscriptions().where("topics", "array-contains", "summary").get());
  const byTenant = new Map<string, PushSubscriptionDoc[]>();
  for (const s of subs) byTenant.set(s.tenantId, [...(byTenant.get(s.tenantId) ?? []), s]);

  let sent = 0;
  for (const [tenantId, list] of byTenant) {
    const snap = await refs.tenant(tenantId).get();
    if (!snap.exists) continue;
    const t = { id: snap.id, ...snap.data() } as Tenant;
    if (!t.modules.billing) continue;
    const yesterday = shiftDay(venueDay(t), -1);
    const weekBefore = shiftDay(yesterday, -7);
    const totals = await dailyTotals(tenantId, weekBefore, yesterday);
    const y = totals.get(yesterday) ?? { revenueCents: 0, bills: 0, covers: 0 };
    const w = totals.get(weekBefore)?.revenueCents ?? 0;
    const delta = deltaLabel(y.revenueCents, w);
    const msg = {
      title: `${t.displayName} · ieri ${formatEuro(y.revenueCents)}`,
      body: `${y.bills} conti · ${y.covers} coperti${delta ? ` · ${delta} rispetto a una settimana prima` : ""}`,
      tag: "summary",
    };
    for (const s of list) {
      await sendOne(s, msg);
      sent++;
    }
  }
  return NextResponse.json({ reviews, sent });
}

async function sendReviewInvites(): Promise<number> {
  const tenants = allWithId<Tenant>(await refs.tenants().where("settings.reviews.enabled", "==", true).get());
  let n = 0;
  for (const t of tenants) {
    if (!tenantSubscription(t).accessAllowed) continue;
    try {
      n += await sendDueReviewEmails(t, venueDay(t));
    } catch (e) {
      console.error("review invites failed", t.id, e);
    }
  }
  return n;
}
