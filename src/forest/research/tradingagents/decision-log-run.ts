// Deliberation Run Logger — appends all stages of a debate run sequentially.

import type { AppendResult } from '@/tree/research/tradingagents/decision-log';
import { DecisionLogWriter, type DecisionLogKindExt } from './decision-log-writer';

export interface DeliberationRunStages {
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
}

/** Convenience: append all deliberation stages in order. */
export async function logDeliberationRun(
  writer: DecisionLogWriter,
  stages: DeliberationRunStages,
): Promise<AppendResult> {
  let lastResult: AppendResult = {
    ok: true,
    log: writer.getLog(),
    entry: {
      kind: 'analyst-output',
      researchGoalId: '',
      proposalId: '',
      payloadJson: '{}',
      timestamp: '',
      seq: 0,
      hash: '',
      prevHash: null,
    },
  };

  const append = async (kind: DecisionLogKindExt, payload: unknown): Promise<boolean> => {
    lastResult = await writer.append(
      kind,
      stages.researchGoalId,
      stages.proposalId,
      payload,
      stages.timestamp,
    );
    return lastResult.ok;
  };

  for (const output of stages.analystOutputs) {
    if (!(await append('analyst-output', output))) return lastResult;
  }

  for (const output of stages.debateOutputs) {
    if (!(await append('debate-output', output))) return lastResult;
  }

  if (!(await append('research-synthesis', stages.researchSynthesis))) return lastResult;
  if (!(await append('risk-proposal', stages.riskProposal))) return lastResult;
  if (!(await append('portfolio-proposal', stages.portfolioProposal))) return lastResult;
  if (!(await append('cashclaw-validation', stages.cashclawValidation))) return lastResult;

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
