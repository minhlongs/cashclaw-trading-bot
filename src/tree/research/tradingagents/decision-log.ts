// DecisionLog — append-only, hash-chained deliberation decision log
// (task §10). Pure module: no I/O, no DB. Mirrors the audit-ledger
// hash-chain pattern (hash = SHA256(prevHash + '\n' + canonical(payload)))
// but lives in the tree layer as an immutable value structure. Historical
// evidence is NEVER overwritten: append returns a new log; entries cannot
// be mutated, replaced, or removed.

import { canonicalize } from '@/lib/canonical-json';

/** Every recordable stage of one deliberation run (task §10). */
export const DECISION_LOG_KINDS = [
  'analyst-output',
  'debate-output',
  'research-synthesis',
  'risk-proposal',
  'portfolio-proposal',
  'cashclaw-validation',
  'human-decision',
] as const;
export type DecisionLogKind = (typeof DECISION_LOG_KINDS)[number];

/** One append-only log entry. */
export interface DecisionLogEntry {
  readonly seq: number;
  readonly kind: DecisionLogKind;
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly payloadJson: string;
  readonly timestamp: string;
  readonly prevHash: string | null;
  readonly hash: string;
}

/** An immutable decision log (append returns a NEW log). */
export interface DecisionLog {
  readonly entries: readonly DecisionLogEntry[];
  readonly tailHash: string | null;
}

/** Append outcome: fail-closed. */
export type AppendResult =
  | { readonly ok: true; readonly log: DecisionLog; readonly entry: DecisionLogEntry }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Verify outcome for a whole log chain. */
export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** The empty log. */
export const EMPTY_DECISION_LOG: DecisionLog = { entries: [], tailHash: null };

/** SHA-256 hex via WebCrypto (Workers + Node ≥ 18). */
async function sha256Hex(input: string): Promise<string> {
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
