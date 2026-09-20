// Checkpoint Adapter core — serializes/deserializes DebateCheckpoint.
// Pure module: no LangGraph imports. SHA-256 resultHash over canonical
// debateState (WebCrypto only). Round-trip tested.

import {
  serializeCheckpoint,
  deserializeCheckpoint,
  computeDebateResultHash,
  type DebateCheckpoint,
  type DebateState,
} from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenance, ToolProvenance } from '@/tree/research/tradingagents';
import type { CheckpointEnvelope, CheckpointAdapterResult } from './checkpoint-adapter.types';

export { resumeFromCheckpoint, verifyCheckpoint } from './checkpoint-adapter-verify';

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
  modelProvenance: readonly ModelProvenance[],
  toolProvenance: readonly ToolProvenance[],
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
