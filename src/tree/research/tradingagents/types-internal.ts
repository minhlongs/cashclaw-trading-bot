// DebateCheckpoint — types shared internally among debate-state submodules.

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
