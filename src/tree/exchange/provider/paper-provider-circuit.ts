// PaperExchangeProvider backoff state — exponential backoff clock tied to
// consecutive failures. Stateless helpers: the class owns the mutable fields
// (backoffMs, backoffExpiresAt) and calls these on transitions.

/**
 * Compute the next backoff window after a failure.
 * - first failure → 1s
 * - subsequent → doubling, capped at 60s
 * Returns { backoffMs, expiresAt }.
 */
export function computeNextBackoff(
  currentBackoffMs: number,
  now: number = Date.now(),
): { backoffMs: number; expiresAt: number } {
  const next = currentBackoffMs === 0 ? 1_000 : currentBackoffMs * 2;
  const backoffMs = Math.min(60_000, next);
  return { backoffMs, expiresAt: now + backoffMs };
}

/**
 * Remaining backoff wait, or 0 if expired (resets currentBackoffMs in place
 * via the returned flag).
 */
export function resolveBackoffMs(
  backoffMs: number,
  backoffExpiresAt: number,
  now: number = Date.now(),
): { waitMs: number; expired: boolean } {
  if (backoffExpiresAt > now) {
    return { waitMs: Math.max(0, backoffExpiresAt - now), expired: false };
  }
  return { waitMs: 0, expired: true };
}
