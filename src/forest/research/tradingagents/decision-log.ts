// Decision Log — append-only writer reusing audit-ledger hash-chain pattern.
// Pure function (no I/O, no DB). Never overwrites. Records all deliberation
// stages + CashClaw validation + human decision.

import {
  appendDecisionLogEntry,
  verifyDecisionLog,
  EMPTY_DECISION_LOG,
  type DecisionLog,
  type DecisionLogEntry,
  type AppendResult,
  type VerifyResult,
} from '@/tree/research/tradingagents/decision-log';
import { canonicalize } from '@/lib/canonical-json';

/** Extended entry kind for forest layer (includes deliberation-specific stages). */
export const DECISION_LOG_KINDS_EXT = [
  'analyst-output',
  'debate-output',
  'research-synthesis',
  'risk-proposal',
  'portfolio-proposal',
  'cashclaw-validation',
  'human-decision',
] as const;
export type DecisionLogKindExt = (typeof DECISION_LOG_KINDS_EXT)[number];

/** Decision log writer (append-only, no mutation). */
export class DecisionLogWriter {
  private log: DecisionLog;

  constructor(initialLog: DecisionLog = EMPTY_DECISION_LOG) {
    this.log = initialLog;
  }

  /** Get current log (immutable snapshot). */
  getLog(): DecisionLog {
    return this.log;
  }

  /** Append an entry. Returns new writer with updated log. */
  async append(
    kind: DecisionLogKindExt,
    researchGoalId: string,
    proposalId: string,
    payload: unknown,
    timestamp: string,
  ): Promise<AppendResult> {
    const result = await appendDecisionLogEntry(this.log, {
      kind,
      researchGoalId,
      proposalId,
      payload,
      timestamp,
    });
    if (result.ok) {
      this.log = result.log;
    }
    return result;
  }

  /** Verify the entire chain. */
  async verify(): Promise<VerifyResult> {
    return verifyDecisionLog(this.log);
  }

  /** Export as JSON array for persistence (Phase 2/3 precedent: committed JSON record). */
  toJSON(): string {
    return canonicalize(this.log);
  }

  /** Create a writer from a JSON export (for replay/resume). */
  static async fromJSON(json: string): Promise<{ ok: true; writer: DecisionLogWriter } | { ok: false; reasons: readonly string[] }> {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, reasons: ['decision log: invalid JSON'] };
    }

    if (typeof raw !== 'object' || raw === null || !('entries' in raw)) {
      return { ok: false, reasons: ['decision log: missing entries array'] };
    }

    const log = raw as { entries: readonly DecisionLogEntry[]; tailHash: string | null };
    const verified = await verifyDecisionLog(log as DecisionLog);
    if (!verified.ok) {
      return { ok: false, reasons: verified.reasons };
    }

    return { ok: true, writer: new DecisionLogWriter(log as DecisionLog) };
  }
}

/** Convenience: append all deliberation stages in order. */
export async function logDeliberationRun(
  writer: DecisionLogWriter,
  stages: {
    readonly researchGoalId: string;
    readonly proposalId: string;
    readonly analystOutputs: readonly unknown[];
    readonly debateOutputs: readonly unknown[];
    readonly researchSynthesis: unknown;
    readonly riskProposal: unknown;
    readonly portfolioProposal: unknown;
    readonly cashclawValidation: unknown;
    readonly humanDecision?: unknown;
    readonly timestamp: string;
  },
): Promise<AppendResult> {
  // Append through the writer so its internal log is updated (writer.toJSON()
  // returns the full chain). Appending to a detached copy silently dropped
  // every entry from the exported log.
  let lastResult: AppendResult = { ok: true, log: writer.getLog(), entry: { kind: 'analyst-output', researchGoalId: '', proposalId: '', payloadJson: '{}', timestamp: '', seq: 0, hash: '', prevHash: null } };

  const append = async (kind: DecisionLogKindExt, payload: unknown): Promise<boolean> => {
    lastResult = await writer.append(kind, stages.researchGoalId, stages.proposalId, payload, stages.timestamp);
    return lastResult.ok;
  };

  // 1. Analyst outputs
  for (const output of stages.analystOutputs) {
    if (!(await append('analyst-output', output))) return lastResult;
  }

  // 2. Debate outputs
  for (const output of stages.debateOutputs) {
    if (!(await append('debate-output', output))) return lastResult;
  }

  // 3. Research synthesis
  if (!(await append('research-synthesis', stages.researchSynthesis))) return lastResult;

  // 4. Risk proposal
  if (!(await append('risk-proposal', stages.riskProposal))) return lastResult;

  // 5. Portfolio proposal
  if (!(await append('portfolio-proposal', stages.portfolioProposal))) return lastResult;

  // 6. CashClaw validation
  if (!(await append('cashclaw-validation', stages.cashclawValidation))) return lastResult;

  // 7. Human decision (optional)
  if (stages.humanDecision !== undefined) {
    if (!(await append('human-decision', stages.humanDecision))) return lastResult;
  }

  const finalLog = writer.getLog();
  const lastEntry = finalLog.entries[finalLog.entries.length - 1];
  if (!lastEntry) {
    return { ok: false, reasons: ['decision log: no entries appended'] };
  }
  return { ok: true, log: finalLog, entry: lastEntry };
}