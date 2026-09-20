// DebateCheckpoint — serialize/deserialize round-trip with fail-closed
// validation. A checkpoint is valid only when its Zod shape, top-level id
// agreement, and resultHash all agree.

import { canonicalize } from '@/lib/canonical-json';
import type { DebateCheckpoint, SerializeCheckpointResult, DeserializeCheckpointResult } from './types-internal';
import { debateCheckpointSchema, formatZodIssues } from './debate-state-schemas';
import { computeDebateResultHash } from './debate-state-hash';

/**
 * Serialize a checkpoint to deterministic canonical JSON. Fail-closed:
 * validates the record first, then verifies resultHash matches the debate
 * state (a tampered checkpoint is never serialized).
 */
export async function serializeCheckpoint(
  checkpoint: DebateCheckpoint,
): Promise<SerializeCheckpointResult> {
  const parsed = debateCheckpointSchema.safeParse(checkpoint);
  if (!parsed.success) {
    return { ok: false, reasons: formatZodIssues(parsed.error) };
  }
  if (checkpoint.debateState.researchGoalId !== checkpoint.researchGoalId) {
    return { ok: false, reasons: ['debate checkpoint: debateState.researchGoalId must match top-level researchGoalId'] };
  }
  if (checkpoint.debateState.proposalId !== checkpoint.proposalId) {
    return { ok: false, reasons: ['debate checkpoint: debateState.proposalId must match top-level proposalId'] };
  }
  const expected = await computeDebateResultHash(checkpoint.debateState);
  if (expected !== checkpoint.resultHash) {
    return { ok: false, reasons: ['debate checkpoint: resultHash does not match canonical debateState'] };
  }
  return { ok: true, json: canonicalize(checkpoint) };
}

/**
 * Deserialize a checkpoint from JSON. Fail-closed: invalid JSON, schema
 * violations, and hash mismatches are all rejected — never partial.
 */
export async function deserializeCheckpoint(json: string): Promise<DeserializeCheckpointResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reasons: ['debate checkpoint: input is not valid JSON'] };
  }
  const parsed = debateCheckpointSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reasons: formatZodIssues(parsed.error) };
  }
  const checkpoint = parsed.data as DebateCheckpoint;
  const expected = await computeDebateResultHash(checkpoint.debateState);
  if (expected !== checkpoint.resultHash) {
    return { ok: false, reasons: ['debate checkpoint: resultHash does not match canonical debateState'] };
  }
  return { ok: true, value: checkpoint };
}
