/**
 * Brute-force protection for PIN / token logins.
 * Pure logic: given recent attempts (newest first), decide whether the key is
 * locked and until when.
 */
export type Attempt = { success: boolean; createdAt: Date };

export type LockoutPolicy = {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
};

export const PIN_LOCKOUT: LockoutPolicy = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const TENANT_LOCKOUT: LockoutPolicy = { maxFailures: 25, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const TOKEN_PROBE_LOCKOUT: LockoutPolicy = { maxFailures: 20, windowMs: 15 * 60_000, lockMs: 60 * 60_000 };

export type LockoutState = { locked: boolean; until: Date | null; remaining: number };

export function evaluateLockout(attemptsNewestFirst: Attempt[], policy: LockoutPolicy, now = new Date()): LockoutState {
  // Failures after the most recent success, within the lookback horizon.
  const horizon = now.getTime() - Math.max(policy.windowMs, policy.lockMs);
  const failures: Date[] = [];
  for (const a of attemptsNewestFirst) {
    if (a.createdAt.getTime() < horizon) break;
    if (a.success) break;
    failures.push(a.createdAt);
  }
  if (failures.length >= policy.maxFailures) {
    // Locked if the Nth most recent failure falls inside the window.
    const nth = failures[policy.maxFailures - 1];
    const newest = failures[0];
    if (newest.getTime() - nth.getTime() <= policy.windowMs) {
      const until = new Date(newest.getTime() + policy.lockMs);
      if (until > now) return { locked: true, until, remaining: 0 };
      return { locked: false, until: null, remaining: policy.maxFailures };
    }
  }
  const inWindow = failures.filter((d) => d.getTime() >= now.getTime() - policy.windowMs).length;
  return { locked: false, until: null, remaining: Math.max(0, policy.maxFailures - inWindow) };
}
