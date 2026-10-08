// Deliberation Pipeline Bridge — safely executes evaluation pipeline over debate hypotheses
import type { DebateToHypothesisResult } from './debate-to-hypothesis-types';
import { runSurvivalGate, type SurvivalGateConfig, type SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import { applyDeliberationFeedback, type DeliberationFeedbackOutcome } from './deliberation-feedback';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';

export interface DeliberationBridgeResult {
  readonly hypothesisCount: number;
  readonly feedbackOutcomes: readonly DeliberationFeedbackOutcome[];
  readonly promotedToPaperCount: number;
  readonly killedCount: number;
}

export function evaluateDebateHypotheses(
  debateResult: DebateToHypothesisResult,
  reports: readonly EvaluationReport[],
  gateConfig?: SurvivalGateConfig,
): DeliberationBridgeResult {
  const outcomes: DeliberationFeedbackOutcome[] = [];
  let promoted = 0;
  let killed = 0;

  for (const report of reports) {
    const gateResult: SurvivalGateResult = runSurvivalGate(report, gateConfig);
    const feedback = applyDeliberationFeedback(debateResult.debateState, gateResult);
    outcomes.push(feedback);

    if (feedback.survivalStatus === 'PAPER_CANDIDATE') {
      promoted++;
    } else {
      killed++;
    }
  }

  return {
    hypothesisCount: debateResult.hypotheses.length,
    feedbackOutcomes: outcomes,
    promotedToPaperCount: promoted,
    killedCount: killed,
  };
}
