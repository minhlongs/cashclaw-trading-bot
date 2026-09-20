// DecisionLog — append-only, hash-chained deliberation decision log
// (task §10). Pure module: no I/O, no DB. Mirrors the audit-ledger
// hash-chain pattern (hash = SHA256(prevHash + '\n' + canonical(payload)))
// but lives in the tree layer as an immutable value structure. Historical
// evidence is NEVER overwritten: append returns a new log; entries cannot
// be mutated, replaced, or removed.

import { canonicalize } from '@/lib/canonical-json';
import {
  DECISION_LOG_KINDS,
  type DecisionLogKind,
  type DecisionLogEntry,
  type DecisionLog,
  type AppendResult,
} from './decision-log-types';
import { computeEntryHash } from './decision-log-hash';

export {
  DECISION_LOG_KINDS,
  type DecisionLogKind,
  type DecisionLogEntry,
  type DecisionLog,
  type AppendResult,
  type VerifyResult,
  EMPTY_DECISION_LOG,
} from './decision-log-types';

export { sha256Hex, computeEntryHash, verifyDecisionLog } from './decision-log-hash';

/**
 * Append one entry. Fail-closed: kind must be a known stage, ids and
 * payloadJson non-empty, payloadJson must be valid JSON, timestamp must be
 * ISO-8601. Returns a NEW log — the input log is never mutated, so
 * historical evidence can never be overwritten.
 */
export async function appendDecisionLogEntry(
  log: DecisionLog,
  input: {
    kind: DecisionLogKind;
    researchGoalId: string;
    proposalId: string;
    payload: unknown;
    timestamp: string;
  },
): Promise<AppendResult> {
  const reasons: string[] = [];
  if (!DECISION_LOG_KINDS.includes(input.kind)) {
    reasons.push(`decision log: unknown kind '${String(input.kind)}'`);
  }
  if (input.researchGoalId.trim() === '') reasons.push('decision log: researchGoalId must be non-empty');
  if (input.proposalId.trim() === '') reasons.push('decision log: proposalId must be non-empty');
  if (Number.isNaN(Date.parse(input.timestamp))) {
    reasons.push('decision log: timestamp must be ISO-8601');
  }
  let payloadJson = '';
  try {
    payloadJson = canonicalize(input.payload);
  } catch {
    reasons.push('decision log: payload is not serializable');
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const prevHash = log.tailHash;
  const hash = await computeEntryHash(prevHash, {
    kind: input.kind,
    researchGoalId: input.researchGoalId,
    proposalId: input.proposalId,
    payloadJson,
    timestamp: input.timestamp,
  });
  const entry: DecisionLogEntry = {
    seq: log.entries.length,
    kind: input.kind,
    researchGoalId: input.researchGoalId,
    proposalId: input.proposalId,
    payloadJson,
    timestamp: input.timestamp,
    prevHash,
    hash,
  };
  return {
    ok: true,
    log: { entries: [...log.entries, entry], tailHash: hash },
    entry,
  };
}
