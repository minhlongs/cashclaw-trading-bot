// Hypothesis Engine — Ablation Testing
//
// Mission Phase 13: isolate each feature's incremental contribution.
// Runs the FULL model, then removes one indicator at a time and re-evaluates.
// A feature whose removal does not materially hurt performance is flagged as
// unnecessary and a candidate for removal.
//
// Pure function — no I/O, deterministic, no randomness. Safe to call from tests
// without a data source.

import type { IndicatorCandle } from '../indicator-types';
import type { AlphaHypothesis, HypothesisEvaluation } from './types';
import { evaluateHypothesis } from './evaluator';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AblationConfig {
  /** Relative drop in winRate (0-1) that counts as a material impact. Default 0.05. */
  readonly materialThresholdPct?: number;
  /** Lookback used by the regime classifier inside evaluateHypothesis. Default 50. */
  readonly regimeLookback?: number;
}

export interface AblationVariant {
  /** Indicator name removed in this variant. */
  readonly removedIndicator: string;
  /** Evaluation of the model with that single indicator removed. */
  readonly evaluation: HypothesisEvaluation;
  /** winRate of the full model minus winRate of this variant. */
  readonly deltaWinRate: number;
  /** passRate of the full model minus passRate of this variant. */
  readonly deltaPassRate: number;
  /** True when the removal materially degraded the model. */
  readonly materialImpact: boolean;
}

export interface AblationResult {
  readonly hypothesisId: string;
  /** Evaluation of the full, unmodified hypothesis. */
  readonly fullEvaluation: HypothesisEvaluation;
  /** One entry per removable indicator. */
  readonly ablations: readonly AblationVariant[];
  /** Indicator names whose removal did not materially hurt the model. */
  readonly flaggedUnnecessary: readonly string[];
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run an ablation over a hypothesis: evaluate the full model, then remove each
 * indicator one at a time and re-evaluate. Reports the incremental contribution
 * of every indicator.
 *
 * Ablation is a research tool only — it never places orders or touches live
 * capital. It is PAPER/BACKTEST ONLY.
 */
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

  // Iterate over every indicator. With 0 indicators the loop is a no-op; with 1
  // indicator the variant has an empty signal set.
  for (const preset of hypothesis.indicatorSet) {
    const variant: AlphaHypothesis = {
      ...hypothesis,
      indicatorSet: hypothesis.indicatorSet.filter((p) => p.indicator !== preset.indicator),
    };

    const evaluation = evaluateHypothesis(variant, candles, regimeLookback);
    const deltaWinRate = fullEvaluation.winRate - evaluation.winRate;
    const deltaPassRate = fullEvaluation.passRate - evaluation.passRate;
    const materialImpact = deltaWinRate > materialThresholdPct;

    ablations.push({
      removedIndicator: preset.indicator,
      evaluation,
      deltaWinRate,
      deltaPassRate,
      materialImpact,
    });

    if (!materialImpact) {
      flaggedUnnecessary.push(preset.indicator);
    }
  }

  return {
    hypothesisId: hypothesis.id,
    fullEvaluation,
    ablations,
    flaggedUnnecessary,
  };
}