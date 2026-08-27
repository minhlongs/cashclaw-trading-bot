// DebateCheckpoint — checkpoint state adapter for the deliberation layer
// (task §9). Pure module: no I/O, no LangGraph dependency. CashClaw owns
// its own checkpoint shape; the adapter serializes/deserializes it
// deterministically and binds every checkpoint to a SHA-256 resultHash of
// the canonical debate state (WebCrypto only). Fail-closed validation.

import { z } from 'zod';
import { canonicalize } from '@/lib/canonical-json';
import type { ModelProvenance, ToolProvenance } from './types';

/** One debate round: which agent spoke, in what role, with what content. */
export interface DebateRound {
  readonly agentRole: string;
  readonly agentId: string;
  readonly content: string;
  readonly round: number;
}

/** The debate state captured at a checkpoint (opaque to CashClaw). */
export interface DebateState {
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly rounds: readonly DebateRound[];
  readonly status: 'in-progress' | 'complete' | 'aborted';
}

/** A full checkpoint record (task §9). */
export interface DebateCheckpoint {
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly debateState: DebateState;
  readonly modelProvenance: readonly ModelProvenance[];
  readonly toolProvenance: readonly ToolProvenance[];
  readonly timestamp: string;
  /** SHA-256 hex of canonicalize(debateState). */
  readonly resultHash: string;
}

/** Serialize outcome: fail-closed. */
export type SerializeCheckpointResult =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Deserialize outcome: fail-closed. */
export type DeserializeCheckpointResult =
  | { readonly ok: true; readonly value: DebateCheckpoint }
  | { readonly ok: false; readonly reasons: readonly string[] };

const HEX64 = /^[0-9a-f]{64}$/;
const isoDateTime = z.string().datetime({ offset: true });

const debateRoundSchema = z.object({
  agentRole: z.string().min(1),
  agentId: z.string().min(1),
  content: z.string(),
  round: z.number().int().nonnegative(),
});

const debateStateSchema = z.object({
  researchGoalId: z.string().min(1),
  proposalId: z.string().min(1),
  rounds: z.array(debateRoundSchema),
  status: z.enum(['in-progress', 'complete', 'aborted']),
});

const modelProvenanceSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  tier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

const toolProvenanceSchema = z.object({
  toolName: z.string().min(1),
  allowlisted: z.boolean(),
});

/** Zod schema for DebateCheckpoint (exactly the 7 fields of §9). */
export const debateCheckpointSchema = z.object({
  researchGoalId: z.string().min(1),
  proposalId: z.string().min(1),
  debateState: debateStateSchema,
  modelProvenance: z.array(modelProvenanceSchema),
  toolProvenance: z.array(toolProvenanceSchema),
  timestamp: isoDateTime,
  resultHash: z.string().regex(HEX64),
});

/** SHA-256 hex of a string via WebCrypto (Workers + Node ≥ 18). */
async function sha256Hex(input: string): Promise<string> {
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
 * Serialize a checkpoint to deterministic canonical JSON. Fail-closed:
 * validates the record first, then verifies resultHash matches the debate
 * state (a tampered checkpoint is never serialized).
 */
export async function serializeCheckpoint(
  checkpoint: DebateCheckpoint,
): Promise<SerializeCheckpointResult> {
  const parsed = debateCheckpointSchema.safeParse(checkpoint);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
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
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }
  const checkpoint = parsed.data as DebateCheckpoint;
  const expected = await computeDebateResultHash(checkpoint.debateState);
  if (expected !== checkpoint.resultHash) {
    return { ok: false, reasons: ['debate checkpoint: resultHash does not match canonical debateState'] };
  }
  return { ok: true, value: checkpoint };
}
