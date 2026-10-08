/**
 * Alpha Research OS Phase 9: Conjunctive Promotion Gate Engine.
 * Evaluates candidate strategies across all 15 verification gates.
 * All 15 checks must pass to achieve PASSED; failing any 1 check yields KILLED.
 */

import {
  checkMinTrades,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMaxDrawdown,
  checkMinSharpeSortino,
  checkMinRegimeCoverage,
} from './financial-checks';
import { checkFeeStress, checkSlippageStress } from './stress-checks';
import {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from './robustness-checks';
import {
  DEFAULT_PROMOTION_GATE_CONFIG,
  type GateCheck,
  type PromotionGateConfig,
  type PromotionGateInput,
  type PromotionGateResult,
} from './types';
import {
  PromotionGateConfigSchema,
  PromotionGateInputSchema,
  PromotionGateResultSchema,
} from './schemas';

/**
 * Executes the 15-point promotion gate checklist for a candidate strategy.
 *
 * @param input - Quantitative metrics spanning financial, stress, and robustness domains.
 * @param config - Optional configuration overrides merged with DEFAULT_PROMOTION_GATE_CONFIG.
 * @returns Comprehensive PromotionGateResult with conjunctive verdict and failure diagnostics.
 */
export function runPromotionGate(
  input: PromotionGateInput,
  config?: Partial<PromotionGateConfig>,
): PromotionGateResult {
  PromotionGateInputSchema.parse(input);

  const mergedConfig: PromotionGateConfig = {
    ...DEFAULT_PROMOTION_GATE_CONFIG,
    ...(config ?? {}),
  };
  const validatedConfig = PromotionGateConfigSchema.parse(mergedConfig);

  const checks: readonly GateCheck[] = [
    checkMinTrades(input.financial.numTrades, validatedConfig.minTrades),
    checkMinNetExpectancy(input.financial.expectancy, validatedConfig.minNetExpectancy),
    checkMinProfitFactor(input.financial.profitFactor, validatedConfig.minProfitFactor),
    checkMaxDrawdown(input.financial.maxDrawdown, validatedConfig.maxDrawdown),
    checkMinSharpeSortino(
      input.financial.sharpe,
      input.financial.sortino,
      validatedConfig.minSharpe,
      validatedConfig.minSortino,
    ),
    checkMinRegimeCoverage(input.financial.byRegime, validatedConfig.minRegimeCoverage),
    checkFeeStress(input.stress.netPnlNormal, input.stress.netPnlConservative),
    checkSlippageStress(input.stress.netPnlAdverse, input.stress.netPnlExtreme),
    checkParameterRobustness(
      input.robustness.parameterSpread,
      validatedConfig.maxParameterSpread,
    ),
    checkCrossPeriodRobustness(
      input.robustness.crossPeriodPositiveFraction,
      validatedConfig.minCrossPeriodConsistency,
    ),
    checkCrossAssetRobustness(
      input.robustness.crossAssetPositiveFraction,
      input.robustness.crossAssetApplicable,
      validatedConfig.minCrossAssetConsistency,
    ),
    checkLeakageInvariance(input.robustness.leakageViolations),
    checkNoSingleWindowDependency(
      input.robustness.windowPnls,
      validatedConfig.maxSingleWindowContribution,
    ),
    checkBaselineComparison(
      input.robustness.baselineCandidate,
      input.robustness.baselineBuyHold,
      input.robustness.baselineRandomEntry,
    ),
    checkReproducibleHash(
      input.robustness.hashMatches,
      input.robustness.hashDetails,
    ),
  ];

  const failedChecks = checks.filter((c) => !c.passed);
  const passed = failedChecks.length === 0;
  const verdict: 'PASSED' | 'KILLED' = passed ? 'PASSED' : 'KILLED';
  const diagnosticReasons = failedChecks.map(
    (c) => `Check [${c.name}] failed: ${c.detail}`,
  );

  const result: PromotionGateResult = {
    passed,
    verdict,
    checks,
    failedChecks,
    diagnosticReasons,
    timestamp: Date.now(),
  };

  PromotionGateResultSchema.parse(result);
  return result;
}
