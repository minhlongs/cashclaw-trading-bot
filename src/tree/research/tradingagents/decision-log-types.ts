// DecisionLog — shared types (task §10).

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
