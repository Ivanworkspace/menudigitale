import "server-only";
import { refs, expireIn } from "@/server/db";
import { evaluateLockout, type LockoutPolicy, type LockoutState } from "@/domain/lockout";

/**
 * Firestore-backed attempt tracking (auth_attempts, auto-deleted by TTL on
 * `expireAt`). Good enough for login endpoints.
 */
export async function checkLockout(scope: string, key: string, policy: LockoutPolicy): Promise<LockoutState> {
  const since = new Date(Date.now() - Math.max(policy.windowMs, policy.lockMs)).toISOString();
  const snap = await refs
    .authAttempts()
    .where("k", "==", `${scope}|${key}`)
    .where("createdAt", ">=", since)
    .orderBy("createdAt", "desc")
    .limit(policy.maxFailures * 4)
    .get();
  return evaluateLockout(
    snap.docs.map((d) => ({ success: d.get("success") as boolean, createdAt: new Date(d.get("createdAt")) })),
    policy,
  );
}

export async function recordAttempt(scope: string, key: string, success: boolean, tenantId?: string | null) {
  await refs.authAttempts().add({
    k: `${scope}|${key}`,
    success,
    tenantId: tenantId ?? null,
    createdAt: new Date().toISOString(),
    expireAt: expireIn(2 * 86_400_000),
  });
}
