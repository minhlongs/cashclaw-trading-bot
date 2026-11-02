// Immutable approved-snapshot contract.
// An approval binds to exactly one action: its type, payload, resolved target descriptor and
// retry policy. The SHA-256 hash below is a CONSISTENCY check (detects post-approval edits), not
// business evidence of completion. Input never contains secrets: the target descriptor is a
// non-secret identifier (chat id / host / email address) and the policy is plain numbers.

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly requestTimeoutMs: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly approvalTtlMs: number;
}

export interface ApprovedSnapshotInput {
  readonly actionType: string;
  readonly payload: unknown;
  readonly target: string;
  readonly policy: RetryPolicy;
}

// Conservative test-environment defaults chosen by the agent — NOT owner-approved production
// limits. Production values must be set explicitly and re-approved by the owner.
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  requestTimeoutMs: 10_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,
  approvalTtlMs: 86_400_000,
};

export const RETRY_POLICY_BOUNDS = {
  maxAttempts: { min: 1, max: 10 },
  requestTimeoutMs: { min: 100, max: 60_000 },
  backoffBaseMs: { min: 100, max: 10_000 },
  backoffMaxMs: { min: 100, max: 300_000 },
  approvalTtlMs: { min: 60_000, max: 604_800_000 },
} as const;

export function validateRetryPolicy(candidate: Partial<RetryPolicy> | null | undefined): { ok: true; policy: RetryPolicy } | { ok: false; error: string } {
  const merged: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...(candidate ?? {}) };
  for (const [key, bounds] of Object.entries(RETRY_POLICY_BOUNDS)) {
    const value = merged[key as keyof RetryPolicy];
    if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
      return { ok: false, error: `policy.${key} must be an integer in [${bounds.min}, ${bounds.max}]` };
    }
  }
  if (merged.backoffMaxMs < merged.backoffBaseMs) {
    return { ok: false, error: 'policy.backoffMaxMs must be >= policy.backoffBaseMs' };
  }
  return { ok: true, policy: merged };
}

// Canonical JSON: stable key order and no whitespace, so the hash is deterministic across runtimes.
export function canonicalSnapshotJson(input: ApprovedSnapshotInput): string {
  return JSON.stringify({
    v: 1,
    actionType: input.actionType,
    payload: input.payload ?? null,
    target: input.target,
    policy: {
      maxAttempts: input.policy.maxAttempts,
      requestTimeoutMs: input.policy.requestTimeoutMs,
      backoffBaseMs: input.policy.backoffBaseMs,
      backoffMaxMs: input.policy.backoffMaxMs,
      approvalTtlMs: input.policy.approvalTtlMs,
    },
  });
}

export async function computeApprovedSha256(input: ApprovedSnapshotInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSnapshotJson(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function backoffMsFor(policy: RetryPolicy, attemptNo: number): number {
  const exponent = Math.max(0, attemptNo - 1);
  const raw = policy.backoffBaseMs * 2 ** Math.min(exponent, 20);
  return Math.min(raw, policy.backoffMaxMs);
}
