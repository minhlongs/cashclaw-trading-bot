// Decision Log Writer — append-only writer reusing audit-ledger hash-chain pattern.
// Pure function (no I/O, no DB). Never overwrites. Records deliberation stages.

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
  static async fromJSON(
    json: string,
  ): Promise<{ ok: true; writer: DecisionLogWriter } | { ok: false; reasons: readonly string[] }> {
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
