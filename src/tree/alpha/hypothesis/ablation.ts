// Hypothesis Engine — Ablation Testing (pure function, no I/O, deterministic).
import type { IndicatorCandle } from '../indicator-types';
import type { AlphaHypothesis, HypothesisEvaluation } from './types';
import { evaluateHypothesis } from './evaluator';

export interface AblationConfig {
  /** Relative drop in winRate (0-1) that counts as a material impact. Default 0.05. */
  readonly materialThresholdPct?: number;
  /** Lookback used by the regime classifier inside evaluateHypothesis. Default 50. */
  readonly regimeLookback?: number;
}

export interface AblationVariant {
  readonly removedIndicator: string;
  readonly evaluation: HypothesisEvaluation;
  readonly deltaWinRate: number;
  readonly deltaPassRate: number;
  readonly materialImpact: boolean;
}

export interface AblationResult {
  readonly hypothesisId: string;
  readonly fullEvaluation: HypothesisEvaluation;
  readonly ablations: readonly AblationVariant[];
  readonly flaggedUnnecessary: readonly string[];
}

export function runAblation(
  hypothesis: AlphaHypothesis,
  candles: readonly IndicatorCandle[],
  config: AblationConfig = {},
): AblationResult {
  const materialThresholdPct = config.materialThresholdPct ?? 0.05;
  const regimeLookback = config.regimeLookback ?? 50;
  const fullEvaluation = evaluateHypothesis(hypothesis, candles, regimeLookback);
  const ablations: AblationVariant[] = [];
  const flaggedUnnecessary: string[] = [];

  for (const preset of hypothesis.indicatorSet) {
    const variant: AlphaHypothesis = {
      ...hypothesis,
      indicatorSet: hypothesis.indicatorSet.filter((p) => p.indicator !== preset.indicator),
    };
    const evaluation = evaluateHypothesis(variant, candles, regimeLookback);
    const deltaWinRate = fullEvaluation.winRate - evaluation.winRate;
    const deltaPassRate = fullEvaluation.passRate - evaluation.passRate;
    const materialImpact = deltaWinRate > materialThresholdPct;
    ablations.push({ removedIndicator: preset.indicator, evaluation, deltaWinRate, deltaPassRate, materialImpact });
    if (!materialImpact) flaggedUnnecessary.push(preset.indicator);
  }

  return { hypothesisId: hypothesis.id, fullEvaluation, ablations, flaggedUnnecessary };
}