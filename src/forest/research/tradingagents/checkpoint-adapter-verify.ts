// Checkpoint Adapter verification — idempotent checkpoint verification
// and resumption helpers. Pure module: no LangGraph imports.

import {
  computeDebateResultHash,
  type DebateState,
} from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenance, ToolProvenance } from '@/tree/research/tradingagents';
import type { CheckpointEnvelope, CheckpointAdapterResult } from './checkpoint-adapter.types';
import { deserializeCheckpointEnvelope } from './checkpoint-adapter.core';

/**
 * Resume from a checkpoint envelope.
 * Returns the DebateState to continue from.
 * Idempotent on resultHash.
 */
export async function resumeFromCheckpoint(
  envelope: CheckpointEnvelope,
): Promise<CheckpointAdapterResult<{ state: DebateState; provenance: { model: readonly ModelProvenance[]; tool: readonly ToolProvenance[] } }>> {
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
