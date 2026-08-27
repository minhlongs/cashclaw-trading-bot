// Checkpoint Adapter — serializes/deserializes DebateCheckpoint.
// Pure module: no LangGraph imports. SHA-256 resultHash over canonical
// debateState (WebCrypto only). Round-trip tested.

import {
  serializeCheckpoint,
  deserializeCheckpoint,
  computeDebateResultHash,
  type DebateCheckpoint,
  type DebateState,
} from '@/tree/research/tradingagents/debate-state';

/** Serialized checkpoint envelope (for storage/transport). */
export interface CheckpointEnvelope {
  readonly version: 1;
  readonly json: string;
  readonly resultHash: string;
}

/** Checkpoint adapter result. */
export type CheckpointAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Serialize a DebateCheckpoint to a transport envelope.
 * Verifies resultHash matches debateState (tamper-proof).
 */
export async function serializeCheckpointEnvelope(
  checkpoint: DebateCheckpoint,
): Promise<CheckpointAdapterResult<CheckpointEnvelope>> {
  const serialized = await serializeCheckpoint(checkpoint);
  if (!serialized.ok) {
    return { ok: false, reasons: serialized.reasons };
  }

  // Re-verify resultHash
  const expectedHash = await computeDebateResultHash(checkpoint.debateState);
  if (expectedHash !== checkpoint.resultHash) {
    return { ok: false, reasons: ['checkpoint: resultHash mismatch on serialize'] };
  }

  return {
    ok: true,
    value: {
      version: 1,
      json: serialized.json,
      resultHash: checkpoint.resultHash,
    },
  };
}

/**
 * Deserialize a checkpoint from a transport envelope.
 * Verifies resultHash matches debateState (tamper-proof).
 */
export async function deserializeCheckpointEnvelope(
  envelope: CheckpointEnvelope,
): Promise<CheckpointAdapterResult<DebateCheckpoint>> {
  if (envelope.version !== 1) {
    return { ok: false, reasons: ['checkpoint: unsupported envelope version'] };
  }

  const deserialized = await deserializeCheckpoint(envelope.json);
  if (!deserialized.ok) {
    return { ok: false, reasons: deserialized.reasons };
  }

  // Re-verify resultHash
  const expectedHash = await computeDebateResultHash(deserialized.value.debateState);
  if (expectedHash !== deserialized.value.resultHash) {
    return { ok: false, reasons: ['checkpoint: resultHash mismatch on deserialize'] };
  }
  if (expectedHash !== envelope.resultHash) {
    return { ok: false, reasons: ['checkpoint: envelope resultHash does not match computed hash'] };
  }

  return { ok: true, value: deserialized.value };
}

/**
 * Create a DebateCheckpoint from a DebateState + provenance.
 * Computes resultHash deterministically.
 */
export async function createCheckpoint(
  researchGoalId: string,
  proposalId: string,
  debateState: DebateState,
  modelProvenance: readonly import('@/tree/research/tradingagents').ModelProvenance[],
  toolProvenance: readonly import('@/tree/research/tradingagents').ToolProvenance[],
  timestamp: string,
): Promise<CheckpointAdapterResult<DebateCheckpoint>> {
  if (debateState.researchGoalId !== researchGoalId) {
    return { ok: false, reasons: ['checkpoint: debateState.researchGoalId mismatch'] };
  }
  if (debateState.proposalId !== proposalId) {
    return { ok: false, reasons: ['checkpoint: debateState.proposalId mismatch'] };
  }

  const resultHash = await computeDebateResultHash(debateState);

  const checkpoint: DebateCheckpoint = {
    researchGoalId,
    proposalId,
    debateState,
    modelProvenance,
    toolProvenance,
    timestamp,
    resultHash,
  };

  const validated = await serializeCheckpoint(checkpoint);
  if (!validated.ok) {
    return { ok: false, reasons: validated.reasons };
  }

  return { ok: true, value: checkpoint };
}

/**
 * Resume from a checkpoint envelope.
 * Returns the DebateState to continue from.
 * Idempotent on resultHash.
 */
export async function resumeFromCheckpoint(
  envelope: CheckpointEnvelope,
): Promise<CheckpointAdapterResult<{ state: DebateState; provenance: { model: readonly import('@/tree/research/tradingagents').ModelProvenance[]; tool: readonly import('@/tree/research/tradingagents').ToolProvenance[] } }>> {
  const deserialized = await deserializeCheckpointEnvelope(envelope);
  if (!deserialized.ok) {
    return { ok: false, reasons: deserialized.reasons };
  }

  const cp = deserialized.value;
  return {
    ok: true,
    value: {
      state: cp.debateState,
      provenance: {
        model: cp.modelProvenance,
        tool: cp.toolProvenance,
      },
    },
  };
}

/**
 * Verify a checkpoint envelope without deserializing.
 * Used for idempotency checks.
 */
export async function verifyCheckpoint(
  envelope: CheckpointEnvelope,
): Promise<CheckpointAdapterResult<{ valid: boolean; hashMatch: boolean }>> {
  try {
    const raw = JSON.parse(envelope.json);
    const state = raw.debateState as DebateState;
    const expectedHash = await computeDebateResultHash(state);
    return {
      ok: true,
      value: {
        valid: true,
        hashMatch: expectedHash === envelope.resultHash,
      },
    };
  } catch {
    return { ok: false, reasons: ['checkpoint: invalid JSON'] };
  }
}