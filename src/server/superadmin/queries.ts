import "server-only";
import { refs, allWithId, withId } from "@/server/db";
import { tenantSubscription } from "@/server/tenancy/resolve";
import type { SubscriptionState } from "@/domain/subscription";
import type { Plan, PlatformSettings, Tenant } from "@/server/db/types";
import { DEFAULT_GRACE_DAYS } from "./defaults";

export type { Plan };

export type TenantOverview = Tenant & {
  planName: string | null;
  priceMonthCents: number | null;
  ordersThisMonth: number;
  sub: SubscriptionState;
};

export const currentMonth = (d = new Date()) => d.toISOString().slice(0, 7);

export async function listPlans(): Promise<Plan[]> {
  const plans = allWithId<Plan>(await refs.plans().get());
  return plans.sort((a, b) => a.sort - b.sort || a.priceMonthCents - b.priceMonthCents);
}

export async function listTenants(): Promise<TenantOverview[]> {
  const [tenants, plans] = await Promise.all([refs.tenants().get().then(allWithId<Tenant>), listPlans()]);
  const byId = new Map(plans.map((p) => [p.id, p]));
  const month = currentMonth();
  const now = new Date();
  return tenants
    .map((t) => ({
      ...t,
      planName: t.planId ? (byId.get(t.planId)?.name ?? null) : null,
      priceMonthCents: t.planId ? (byId.get(t.planId)?.priceMonthCents ?? null) : null,
      ordersThisMonth: t.stats?.ordersMonth === month ? t.stats.ordersThisMonth : 0,
      sub: tenantSubscription(t, now),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const s = withId<PlatformSettings & { id: string }>(await refs.platformSettings().get());
  return {
    brandName: s?.brandName ?? "MenuSaaS",
    brandUrl: s?.brandUrl ?? null,
    defaultGraceDays: s?.defaultGraceDays ?? DEFAULT_GRACE_DAYS,
    expiryWarningDays: s?.expiryWarningDays ?? [14, 7, 3, 1],
  };
}
