// DecisionLog — SHA-256 hash-chain link & full-chain verification (task §10).

import { canonicalize } from '@/lib/canonical-json';
import type { DecisionLogKind, DecisionLog, VerifyResult } from './decision-log-types';

/** SHA-256 hex via WebCrypto (Workers + Node ≥ 18). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash-chain link: SHA256(prevHash + '\n' + canonical payload). */
export async function computeEntryHash(
  prevHash: string | null,
  payload: { kind: DecisionLogKind; researchGoalId: string; proposalId: string; payloadJson: string; timestamp: string },
): Promise<string> {
  return sha256Hex(`${prevHash ?? ''}\n${canonicalize(payload)}`);
}

/**
 * Verify the entire hash chain. Fail-closed: any broken link (wrong
 * prevHash, wrong hash, non-monotonic seq) rejects the whole log.
 */
export async function verifyDecisionLog(log: DecisionLog): Promise<VerifyResult> {
  const reasons: string[] = [];
  let prevHash: string | null = null;
  for (const entry of log.entries) {
    if (entry.prevHash !== prevHash) {
      reasons.push(`decision log: entry ${entry.seq} prevHash does not match previous entry hash`);
    }
    const expected = await computeEntryHash(entry.prevHash, {
      kind: entry.kind,
      researchGoalId: entry.researchGoalId,
      proposalId: entry.proposalId,
      payloadJson: entry.payloadJson,
      timestamp: entry.timestamp,
    });
    if (expected !== entry.hash) {
      reasons.push(`decision log: entry ${entry.seq} hash mismatch (tampered or corrupted)`);
    }
    prevHash = entry.hash;
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}
