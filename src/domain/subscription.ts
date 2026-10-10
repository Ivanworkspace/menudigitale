/**
 * Subscription lifecycle: trial/active → grace period → expired.
 * Manual suspension always wins. Pure logic, used by the daily cron and by
 * every request that checks whether a tenant may be served.
 */
export type TenantStatus = "trial" | "active" | "suspended" | "expired";
export type SubscriptionPhase = "trial" | "active" | "grace" | "expired" | "suspended";

export type SubscriptionInput = {
  status: TenantStatus;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  graceDays: number;
};

export type SubscriptionState = {
  phase: SubscriptionPhase;
  /** Status that should be persisted in tenants.status */
  status: TenantStatus;
  endsAt: Date | null;
  graceEndsAt: Date | null;
  /** Whole days until endsAt (negative once past). null if no expiry. */
  daysLeft: number | null;
  accessAllowed: boolean;
};

const DAY = 86_400_000;

export function computeSubscription(t: SubscriptionInput, now = new Date()): SubscriptionState {
  const endsAt = t.status === "trial" ? (t.trialEndsAt ?? t.subscriptionEndsAt) : (t.subscriptionEndsAt ?? t.trialEndsAt);
  const graceEndsAt = endsAt ? new Date(endsAt.getTime() + t.graceDays * DAY) : null;
  const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / DAY) : null;
  const base = { endsAt, graceEndsAt, daysLeft };

  if (t.status === "suspended") return { ...base, phase: "suspended", status: "suspended", accessAllowed: false };
  if (!endsAt || now <= endsAt) {
    if (t.status === "expired") {
      // Renewed (end date moved forward) but status not yet updated.
      return { ...base, phase: "active", status: "active", accessAllowed: true };
    }
    return { ...base, phase: t.status === "trial" ? "trial" : "active", status: t.status, accessAllowed: true };
  }
  if (graceEndsAt && now <= graceEndsAt) {
    return { ...base, phase: "grace", status: t.status === "expired" ? "active" : t.status, accessAllowed: true };
  }
  return { ...base, phase: "expired", status: "expired", accessAllowed: false };
}

/** True when a reminder should be sent today. */
export function shouldWarn(state: SubscriptionState, warningDays: number[]): boolean {
  if (state.daysLeft === null) return false;
  if (state.phase === "grace") return true; // remind daily while in grace
  return (state.phase === "trial" || state.phase === "active") && warningDays.includes(state.daysLeft);
}

export const PHASE_LABELS: Record<SubscriptionPhase, string> = {
  trial: "In prova",
  active: "Attivo",
  grace: "In tolleranza",
  expired: "Scaduto",
  suspended: "Sospeso",
};
