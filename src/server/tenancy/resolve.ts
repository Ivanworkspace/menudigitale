import "server-only";
import { cache } from "react";
import { refs, withId } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { computeSubscription } from "@/domain/subscription";
import type { Tenant } from "@/server/db/types";

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{40,64}$/;

export const getTenant = cache(async (id: string): Promise<Tenant | null> => withId<Tenant>(await refs.tenant(id).get()));

/** Finds the tenant owning a secret management token (by hash). */
export const resolveTenantByToken = cache(async (token: string): Promise<Tenant | null> => {
  if (!TOKEN_FORMAT.test(token)) return null;
  const snap = await refs.accessTokens().doc(sha256(token)).get();
  if (!snap.exists) return null;
  return getTenant(snap.get("tenantId"));
});

export const resolveTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  const snap = await refs.slugs().doc(slug).get();
  if (!snap.exists) return null;
  return getTenant(snap.get("tenantId"));
});

export function tenantSubscription(t: Pick<Tenant, "status" | "trialEndsAt" | "subscriptionEndsAt" | "graceDays">, now = new Date()) {
  return computeSubscription(
    {
      status: t.status,
      trialEndsAt: t.trialEndsAt ? new Date(t.trialEndsAt) : null,
      subscriptionEndsAt: t.subscriptionEndsAt ? new Date(t.subscriptionEndsAt) : null,
      graceDays: t.graceDays,
    },
    now,
  );
}
