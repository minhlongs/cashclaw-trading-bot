// DebateCheckpoint — deterministic resultHash over the canonical debate state.
// Uses WebCrypto (SHA-256) so it runs in both Workers and Node >= 18.

import { canonicalize } from '@/lib/canonical-json';
import type { DebateState } from './types-internal';
import { debateStateSchema } from './debate-state-schemas';

/** SHA-256 hex of a string via WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Deterministic resultHash over the canonical debate state. */
export async function computeDebateResultHash(state: DebateState): Promise<string> {
  return sha256Hex(canonicalize(state));
}

/**
 * Validate the debateState and compute its hash in one call. Returns the
 * hash on ok; on failure the reasons list describes the schema violation.
 */
export async function hashDebateStateOrFail(
  state: unknown,
): Promise<{ ok: true; hash: string } | { ok: false; reasons: readonly string[] }> {
  const parsed = debateStateSchema.safeParse(state);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map(
        (issue) => `debateState.${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, hash: await computeDebateResultHash(parsed.data) };
}
