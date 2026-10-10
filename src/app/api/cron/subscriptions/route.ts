import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { refs, allWithId, nowIso } from "@/server/db";
import { computeSubscription, shouldWarn } from "@/domain/subscription";
import { serverEnv } from "@/lib/env";
import { sendExpiryWarning } from "@/server/notifications/email";
import { getPlatformSettings } from "@/server/superadmin/queries";
import type { Tenant } from "@/server/db/types";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Daily (Vercel Cron): applies automatic expiry after the grace period and
 * sends reminders before expiry. Idempotent: safe to run more than once.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [tenants, settings] = await Promise.all([refs.tenants().get().then(allWithId<Tenant>), getPlatformSettings()]);

  const result = { expired: 0, reactivated: 0, warned: 0 };
  for (const t of tenants) {
    const state = computeSubscription(
      {
        status: t.status,
        trialEndsAt: t.trialEndsAt ? new Date(t.trialEndsAt) : null,
        subscriptionEndsAt: t.subscriptionEndsAt ? new Date(t.subscriptionEndsAt) : null,
        graceDays: t.graceDays,
      },
      now,
    );

    if (state.status !== t.status) {
      await refs.tenant(t.id).update({ status: state.status, updatedAt: nowIso() });
      await refs.subscriptionEvents(t.id).add({
        type: state.status === "expired" ? "expired" : "reactivated",
        periodEnd: null, amountCents: null, note: "Aggiornamento automatico", createdBy: null, createdAt: nowIso(),
      });
      if (state.status === "expired") {
        const open = await refs.staffSessions().where("tenantId", "==", t.id).where("revokedAt", "==", null).get();
        await Promise.all(open.docs.map((d) => d.ref.update({ revokedAt: nowIso() })));
        result.expired++;
      } else result.reactivated++;
    }

    if (shouldWarn(state, settings.expiryWarningDays)) {
      const already = await refs
        .subscriptionEvents(t.id)
        .where("type", "==", "warning_sent")
        .where("createdAt", ">=", `${today}T00:00:00.000Z`)
        .limit(1)
        .get();
      if (already.empty) {
        await sendExpiryWarning({ to: t.email, tenantName: t.displayName, state });
        await refs.subscriptionEvents(t.id).add({
          type: "warning_sent",
          periodEnd: state.endsAt?.toISOString() ?? null,
          amountCents: null,
          note: state.phase === "grace" ? "Avviso: periodo di tolleranza" : `Avviso: scade tra ${state.daysLeft} giorni`,
          createdBy: null,
          createdAt: nowIso(),
        });
        result.warned++;
      }
    }
  }
  return NextResponse.json({ ok: true, ...result });
}
